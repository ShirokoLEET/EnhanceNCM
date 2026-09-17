#include "pch.h"

#include "cef_hooks.h"
#include "theme_files.h"
#include "artwork_cache.h"
#include "now_playing_service.h"
#include "smtc_timeline.h"

#include "include/capi/cef_app_capi.h"
#include "include/capi/cef_frame_capi.h"
#include "include/capi/cef_render_process_handler_capi.h"
#include "include/capi/cef_v8_capi.h"

#include <atomic>
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <mutex>
#include <stdexcept>
#include <string>
#include <string_view>
#include <array>

namespace {

int(CEF_CALLBACK *g_origin_execute_process)(const cef_main_args_t *,
                                            cef_app_t *, void *) = nullptr;
cef_render_process_handler_t *(CEF_CALLBACK *g_origin_get_render_process_handler)(
    cef_app_t *) = nullptr;
void(CEF_CALLBACK *g_origin_on_context_created)(
    cef_render_process_handler_t *, cef_browser_t *, cef_frame_t *,
    cef_v8context_t *) = nullptr;

using userfree_free_fn = void(CEF_CALLBACK *)(cef_string_userfree_t);
using utf8_to_utf16_fn = int(CEF_CALLBACK *)(const char *, size_t,
                                             cef_string_utf16_t *);
using utf16_clear_fn = void(CEF_CALLBACK *)(cef_string_utf16_t *);
using set_thread_dpi_awareness_context_fn =
    DPI_AWARENESS_CONTEXT(WINAPI *)(DPI_AWARENESS_CONTEXT);

userfree_free_fn g_userfree_free = nullptr;
utf8_to_utf16_fn g_utf8_to_utf16 = nullptr;
utf16_clear_fn g_utf16_clear = nullptr;
decltype(&cef_v8value_create_object) g_create_object = nullptr;
decltype(&cef_v8value_create_function) g_create_function = nullptr;
decltype(&cef_v8value_create_int) g_create_int = nullptr;
decltype(&cef_v8value_create_string) g_create_string = nullptr;

HMODULE g_self = nullptr;

const char kDefaultPageScript[] = R"JS(
(function () {
  function applyBadge() {
    try {
      document.title = "EnhanceNCM injected";
      if (!document.getElementById("enhancencm-badge")) {
        var parent = document.body || document.documentElement;
        if (!parent) return;
        var el = document.createElement("div");
        el.id = "enhancencm-badge";
        el.textContent = "EnhanceNCM injected";
        el.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:2147483647;background:#d33;color:#fff;font:12px/1.6 sans-serif;padding:2px 8px;border-radius:4px;pointer-events:none;";
        parent.appendChild(el);
      }
    } catch (e) {
    }
  }
  applyBadge();
  var tries = 0;
  var timer = setInterval(function () {
    applyBadge();
    if (++tries >= 40) clearInterval(timer);
  }, 500);
})();
)JS";

std::filesystem::path module_directory(HMODULE module) {
  wchar_t path[MAX_PATH] = {};
  DWORD length = GetModuleFileNameW(module, path, MAX_PATH);
  if (length == 0 || length == MAX_PATH) {
    return {};
  }
  return std::filesystem::path(path).parent_path();
}

std::string read_file(const std::filesystem::path &path) {
  std::ifstream file(path, std::ios::binary);
  if (!file.is_open()) {
    return {};
  }
  return std::string(std::istreambuf_iterator<char>(file),
                     std::istreambuf_iterator<char>());
}

std::string wide_to_utf8(const std::wstring &value) {
  if (value.empty()) {
    return {};
  }
  int size = WideCharToMultiByte(CP_UTF8, 0, value.data(),
                                 static_cast<int>(value.size()), nullptr, 0,
                                 nullptr, nullptr);
  if (size <= 0) {
    return {};
  }
  std::string result(static_cast<size_t>(size), '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.data(),
                      static_cast<int>(value.size()), result.data(), size,
                      nullptr, nullptr);
  return result;
}

void append_log(const std::string &message) {
  wchar_t temp[MAX_PATH] = {};
  if (GetTempPathW(MAX_PATH, temp) == 0) {
    return;
  }

  static std::mutex log_mutex;
  std::lock_guard<std::mutex> lock(log_mutex);

  std::ofstream file(std::filesystem::path(temp) / L"EnhanceNCM-cef.log",
                     std::ios::app);
  if (!file.is_open()) {
    return;
  }

  SYSTEMTIME now = {};
  GetLocalTime(&now);
  char prefix[64] = {};
  std::snprintf(prefix, sizeof(prefix), "[%02u:%02u:%02u.%03u pid=%lu] ",
                now.wHour, now.wMinute, now.wSecond, now.wMilliseconds,
                GetCurrentProcessId());
  file << prefix << message << "\n";
}

std::wstring take_userfree_string(cef_string_userfree_t value) {
  if (!value) {
    return {};
  }
  std::wstring result;
  if (value->str && value->length > 0) {
    result.assign(value->str, value->length);
  }
  if (g_userfree_free) {
    g_userfree_free(value);
  }
  return result;
}

struct BridgeHandler {
  cef_v8handler_t handler;
  std::atomic<int> refcount{1};
};

void CEF_CALLBACK bridge_add_ref(cef_base_ref_counted_t *base) {
  reinterpret_cast<BridgeHandler *>(base)->refcount.fetch_add(1);
}

int CEF_CALLBACK bridge_release(cef_base_ref_counted_t *base) {
  auto *self = reinterpret_cast<BridgeHandler *>(base);
  if (self->refcount.fetch_sub(1) == 1) {
    delete self;
    return 1;
  }
  return 0;
}

int CEF_CALLBACK bridge_has_one_ref(cef_base_ref_counted_t *base) {
  return reinterpret_cast<BridgeHandler *>(base)->refcount.load() == 1 ? 1 : 0;
}

int CEF_CALLBACK bridge_has_at_least_one_ref(cef_base_ref_counted_t *base) {
  return reinterpret_cast<BridgeHandler *>(base)->refcount.load() >= 1 ? 1 : 0;
}

int CEF_CALLBACK bridge_log_execute(cef_v8handler_t *self,
                                    const cef_string_t *name,
                                    cef_v8value_t *object,
                                    size_t arguments_count,
                                    cef_v8value_t *const *arguments,
                                    cef_v8value_t **retval,
                                    cef_string_t *exception) {
  if (name && name->str && std::wstring_view(name->str, name->length) == L"updateSystemTimeline") {
    auto number = [](cef_v8value_t* value) {
      return value && ((value->is_int && value->is_int(value)) ||
        (value->is_uint && value->is_uint(value)) || (value->is_double && value->is_double(value)));
    };
    auto numeric_value = [](cef_v8value_t* value) -> double {
      if (value->is_int && value->is_int(value)) return value->get_int_value(value);
      if (value->is_uint && value->is_uint(value)) return value->get_uint_value(value);
      return value->get_double_value(value);
    };
    if (arguments_count == 3 && number(arguments[0]) && number(arguments[1]) &&
        arguments[2] && arguments[2]->is_bool && arguments[2]->is_bool(arguments[2])) {
      enhancencm_smtc::publish(numeric_value(arguments[0]),
                              numeric_value(arguments[1]),
                              arguments[2]->get_bool_value(arguments[2]) != 0);
    } else if (g_utf8_to_utf16) {
      constexpr char message[] = "Expected timeline position, duration and active state";
      g_utf8_to_utf16(message, sizeof(message) - 1, exception);
    }
    return 1;
  }
  if (name && name->str && std::wstring_view(name->str, name->length) == L"cacheLocalArtwork") {
    try {
      if (arguments_count != 1 || !arguments[0] || !arguments[0]->is_string(arguments[0]) || !g_create_string)
        throw std::invalid_argument("Expected PNG artwork");
      auto data = take_userfree_string(arguments[0]->get_string_value(arguments[0]));
      auto url = enhancencm_artwork::cache_png(data);
      cef_string_utf16_t value = {};
      g_utf8_to_utf16(url.data(), url.size(), &value);
      *retval = g_create_string(&value);
      if (g_utf16_clear) g_utf16_clear(&value);
    } catch (const std::exception& error) {
      g_utf8_to_utf16(error.what(), std::strlen(error.what()), exception);
    }
    return 1;
  }
  if (name && name->str && std::wstring_view(name->str, name->length) == L"readNowPlayingSettings") {
    if (arguments_count == 0 && g_create_string && g_utf8_to_utf16) {
      auto value = enhancencm_now_playing::read_settings();
      cef_string_utf16_t encoded = {};
      g_utf8_to_utf16(value.data(), value.size(), &encoded);
      *retval = g_create_string(&encoded);
      if (g_utf16_clear) g_utf16_clear(&encoded);
    } else if (g_utf8_to_utf16) {
      constexpr char message[] = "Expected no arguments";
      g_utf8_to_utf16(message, sizeof(message) - 1, exception);
    }
    return 1;
  }
  if (name && name->str && std::wstring_view(name->str, name->length) == L"configureNowPlayingService") {
    auto boolean = [](cef_v8value_t *value) {
      return value && value->is_bool && value->is_bool(value);
    };
    if (arguments_count == 2 && boolean(arguments[0]) && boolean(arguments[1])) {
      enhancencm_now_playing::configure(
          arguments[0]->get_bool_value(arguments[0]) != 0,
          arguments[1]->get_bool_value(arguments[1]) != 0);
    } else if (g_utf8_to_utf16) {
      constexpr char message[] = "Expected web API and file output boolean settings";
      g_utf8_to_utf16(message, sizeof(message) - 1, exception);
    }
    return 1;
  }
  if (name && name->str && std::wstring_view(name->str, name->length) == L"publishNowPlaying") {
    auto text = [](cef_v8value_t *value) {
      return value && value->is_string && value->is_string(value);
    };
    if (arguments_count == 6 && std::all_of(arguments, arguments + arguments_count, text)) {
      std::array<std::string, 6> values;
      for (size_t index = 0; index < values.size(); ++index)
        values[index] = wide_to_utf8(take_userfree_string(arguments[index]->get_string_value(arguments[index])));
      enhancencm_now_playing::publish(values[0], values[1], values[2], values[3], values[4], values[5]);
    } else if (g_utf8_to_utf16) {
      constexpr char message[] = "Expected six now-playing JSON payloads";
      g_utf8_to_utf16(message, sizeof(message) - 1, exception);
    }
    return 1;
  }
  if (name && name->str &&
      std::wstring_view(name->str, name->length) == L"cursorPosition") {
    POINT cursor = {};
    // CloudMusic's CEF renderer thread is DPI-unaware. Cursor APIs are still
    // virtualized in that thread, including GetPhysicalCursorPos, so briefly
    // enter a per-monitor context while reading and then restore CEF's context.
    static auto set_thread_dpi_context =
        reinterpret_cast<set_thread_dpi_awareness_context_fn>(GetProcAddress(
            GetModuleHandleW(L"user32.dll"), "SetThreadDpiAwarenessContext"));
    DPI_AWARENESS_CONTEXT previous_dpi_context = nullptr;
    if (set_thread_dpi_context) {
      previous_dpi_context = set_thread_dpi_context(
          reinterpret_cast<DPI_AWARENESS_CONTEXT>(-4));
    }
    BOOL cursor_available = GetPhysicalCursorPos(&cursor);
    if (set_thread_dpi_context && previous_dpi_context) {
      set_thread_dpi_context(previous_dpi_context);
    }
    if (cursor_available && g_create_object && g_create_int) {
      cef_v8value_t *position = g_create_object(nullptr, nullptr);
      cef_string_utf16_t x_name = {}, y_name = {};
      g_utf8_to_utf16("x", 1, &x_name);
      g_utf8_to_utf16("y", 1, &y_name);
      cef_v8value_t *x = g_create_int(cursor.x);
      cef_v8value_t *y = g_create_int(cursor.y);
      if (position && x && y) {
        position->set_value_bykey(position, &x_name, x, V8_PROPERTY_ATTRIBUTE_NONE);
        position->set_value_bykey(position, &y_name, y, V8_PROPERTY_ATTRIBUTE_NONE);
        *retval = position;
        // set_value_bykey unwraps and consumes each C API wrapper reference.
        // Releasing x/y again here would use freed wrappers and crash the
        // renderer before the tray popup can be launched.
      } else {
        if (position) position->base.release(&position->base);
        if (x) x->base.release(&x->base);
        if (y) y->base.release(&y->base);
      }
      if (g_utf16_clear) {
        g_utf16_clear(&x_name);
        g_utf16_clear(&y_name);
      }
    }
    return 1;
  }
  if (arguments_count >= 1 && arguments[0] && arguments[0]->is_string &&
      arguments[0]->is_string(arguments[0])) {
    append_log("[js] " + wide_to_utf8(take_userfree_string(
                               arguments[0]->get_string_value(arguments[0]))));
  }
  return 1;
}

void install_bridge(cef_v8context_t *context) {
  if (!g_create_object || !g_create_function || !g_utf8_to_utf16) {
    return;
  }

  cef_v8value_t *global = context->get_global(context);
  if (!global) {
    return;
  }

  auto *wrapper = new BridgeHandler();
  wrapper->handler.base.size = sizeof(cef_v8handler_t);
  wrapper->handler.base.add_ref = bridge_add_ref;
  wrapper->handler.base.release = bridge_release;
  wrapper->handler.base.has_one_ref = bridge_has_one_ref;
  wrapper->handler.base.has_at_least_one_ref = bridge_has_at_least_one_ref;
  wrapper->handler.execute = bridge_log_execute;

  cef_string_utf16_t namespace_name = {};
  g_utf8_to_utf16("EnhanceNCM", 10, &namespace_name);
  cef_string_utf16_t log_name = {};
  g_utf8_to_utf16("log", 3, &log_name);
  cef_string_utf16_t cursor_name = {};
  g_utf8_to_utf16("cursorPosition", 14, &cursor_name);
  cef_string_utf16_t read_settings_name = {};
  g_utf8_to_utf16("readNowPlayingSettings", 22, &read_settings_name);
  cef_string_utf16_t configure_name = {};
  g_utf8_to_utf16("configureNowPlayingService", 26, &configure_name);
  cef_string_utf16_t publish_name = {};
  g_utf8_to_utf16("publishNowPlaying", 17, &publish_name);

  cef_v8value_t *ns = g_create_object(nullptr, nullptr);
  cef_v8value_t *log_fn = g_create_function(&log_name, &wrapper->handler);
  if (ns && log_fn) {
    ns->set_value_bykey(ns, &log_name, log_fn, V8_PROPERTY_ATTRIBUTE_NONE);
    if (g_create_int) {
      cef_v8value_t *cursor_fn = g_create_function(&cursor_name, &wrapper->handler);
      if (cursor_fn)
        ns->set_value_bykey(ns, &cursor_name, cursor_fn, V8_PROPERTY_ATTRIBUTE_NONE);
    }
    if (g_create_string) {
      cef_string_utf16_t artwork_name = {};
      g_utf8_to_utf16("cacheLocalArtwork", 17, &artwork_name);
      auto function = g_create_function(&artwork_name, &wrapper->handler);
      if (function) ns->set_value_bykey(ns, &artwork_name, function, V8_PROPERTY_ATTRIBUTE_NONE);
      if (g_utf16_clear) g_utf16_clear(&artwork_name);
    }
    {
      cef_string_utf16_t timeline_name = {};
      g_utf8_to_utf16("updateSystemTimeline", 20, &timeline_name);
      auto function = g_create_function(&timeline_name, &wrapper->handler);
      if (function) ns->set_value_bykey(ns, &timeline_name, function, V8_PROPERTY_ATTRIBUTE_NONE);
      if (g_utf16_clear) g_utf16_clear(&timeline_name);
    }
    {
      auto function = g_create_function(&read_settings_name, &wrapper->handler);
      if (function) ns->set_value_bykey(ns, &read_settings_name, function, V8_PROPERTY_ATTRIBUTE_NONE);
    }
    {
      auto function = g_create_function(&configure_name, &wrapper->handler);
      if (function) ns->set_value_bykey(ns, &configure_name, function, V8_PROPERTY_ATTRIBUTE_NONE);
    }
    {
      auto function = g_create_function(&publish_name, &wrapper->handler);
      if (function) ns->set_value_bykey(ns, &publish_name, function, V8_PROPERTY_ATTRIBUTE_NONE);
    }
    global->set_value_bykey(global, &namespace_name, ns,
                            V8_PROPERTY_ATTRIBUTE_NONE);
  }

  if (g_utf16_clear) {
    g_utf16_clear(&namespace_name);
    g_utf16_clear(&log_name);
    g_utf16_clear(&cursor_name);
    g_utf16_clear(&read_settings_name);
    g_utf16_clear(&configure_name);
    g_utf16_clear(&publish_name);
  }
}

void inject_page_script(cef_v8context_t *context) {
  if (!g_utf8_to_utf16) {
    return;
  }

  install_bridge(context);

  std::string script;
  auto directory = module_directory(g_self);
  if (!directory.empty()) {
    auto script_directory = directory / L"EnhanceNCM";
    auto sdk = read_file(script_directory / L"EnhanceNCM-sdk.js");
    auto host = read_file(script_directory / L"EnhanceNCM-page.js");
    if (!sdk.empty() && !host.empty()) {
      script = sdk + "\nEnhanceNCM._themeCatalog = " +
          enhancencm_themes::catalog(module_directory(nullptr) / L"EnhanceNCM" / L"Themes") +
          ";\n" + host;
    } else {
      append_log("Missing EnhanceNCM/EnhanceNCM-sdk.js or EnhanceNCM/EnhanceNCM-page.js");
    }
  }
  if (script.empty()) {
    script = kDefaultPageScript;
  }

  cef_string_utf16_t code = {};
  cef_string_utf16_t url = {};
  g_utf8_to_utf16(script.c_str(), script.size(), &code);
  constexpr char kScriptUrl[] = "enhancencm://page.js";
  g_utf8_to_utf16(kScriptUrl, sizeof(kScriptUrl) - 1, &url);

  cef_v8value_t *retval = nullptr;
  cef_v8exception_t *exception = nullptr;
  context->eval(context, &code, &url, 0, &retval, &exception);

  if (retval) {
    retval->base.release(&retval->base);
  }
  if (exception) {
    append_log("[js] eval exception: " +
               wide_to_utf8(take_userfree_string(
                   exception->get_message(exception))));
    exception->base.release(&exception->base);
  }

  if (g_utf16_clear) {
    g_utf16_clear(&code);
    g_utf16_clear(&url);
  }
}

void CEF_CALLBACK hooked_on_context_created(
    cef_render_process_handler_t *self, cef_browser_t *browser,
    cef_frame_t *frame, cef_v8context_t *context) {
  if (frame && frame->is_main && frame->is_main(frame)) {
    std::wstring url = take_userfree_string(frame->get_url(frame));
    if (url.rfind(L"orpheus://", 0) == 0 ||
        url == L"about:blank#enhancencm") {
      inject_page_script(context);
    }
  }

  if (g_origin_on_context_created) {
    g_origin_on_context_created(self, browser, frame, context);
  }
}

cef_render_process_handler_t *CEF_CALLBACK
hooked_get_render_process_handler(cef_app_t *self) {
  auto *handler = g_origin_get_render_process_handler
                      ? g_origin_get_render_process_handler(self)
                      : nullptr;
  if (handler && handler->on_context_created != hooked_on_context_created) {
    g_origin_on_context_created = handler->on_context_created;
    handler->on_context_created = hooked_on_context_created;
  }
  return handler;
}

int CEF_CALLBACK hooked_execute_process(const cef_main_args_t *args,
                                        cef_app_t *app, void *sandbox_info) {
  if (app) {
    g_origin_get_render_process_handler = app->get_render_process_handler;
    app->get_render_process_handler = hooked_get_render_process_handler;
  }
  if (!g_origin_execute_process) {
    return -1;
  }
  return g_origin_execute_process(args, app, sandbox_info);
}

bool patch_iat(const wchar_t *module_name, const char *imported_dll,
               const char *function_name, void *replacement, void **original) {
  HMODULE module = GetModuleHandleW(module_name);
  if (!module) {
    return false;
  }

  auto *base = reinterpret_cast<uint8_t *>(module);
  auto *dos = reinterpret_cast<IMAGE_DOS_HEADER *>(base);
  if (dos->e_magic != IMAGE_DOS_SIGNATURE) {
    return false;
  }
  auto *nt = reinterpret_cast<IMAGE_NT_HEADERS *>(base + dos->e_lfanew);
  if (nt->Signature != IMAGE_NT_SIGNATURE) {
    return false;
  }

  const auto &directory =
      nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
  if (directory.VirtualAddress == 0 || directory.Size == 0) {
    return false;
  }

  auto *descriptor =
      reinterpret_cast<IMAGE_IMPORT_DESCRIPTOR *>(base + directory.VirtualAddress);
  for (; descriptor->Name != 0; ++descriptor) {
    auto *dll_name = reinterpret_cast<const char *>(base + descriptor->Name);
    if (_stricmp(dll_name, imported_dll) != 0) {
      continue;
    }

    DWORD thunk_rva = descriptor->OriginalFirstThunk
                          ? descriptor->OriginalFirstThunk
                          : descriptor->FirstThunk;
    auto *name_thunk = reinterpret_cast<IMAGE_THUNK_DATA *>(base + thunk_rva);
    auto *iat_thunk = reinterpret_cast<IMAGE_THUNK_DATA *>(base + descriptor->FirstThunk);

    for (; name_thunk->u1.AddressOfData != 0; ++name_thunk, ++iat_thunk) {
      if (IMAGE_SNAP_BY_ORDINAL(name_thunk->u1.Ordinal)) {
        continue;
      }
      auto *import_name = reinterpret_cast<IMAGE_IMPORT_BY_NAME *>(
          base + name_thunk->u1.AddressOfData);
      if (std::strcmp(reinterpret_cast<const char *>(import_name->Name),
                      function_name) != 0) {
        continue;
      }

      DWORD old_protect = 0;
      if (!VirtualProtect(&iat_thunk->u1.Function, sizeof(void *),
                          PAGE_READWRITE, &old_protect)) {
        return false;
      }
      if (original) {
        *original = reinterpret_cast<void *>(iat_thunk->u1.Function);
      }
      iat_thunk->u1.Function = reinterpret_cast<ULONG_PTR>(replacement);
      DWORD ignored = 0;
      VirtualProtect(&iat_thunk->u1.Function, sizeof(void *), old_protect,
                     &ignored);
      FlushInstructionCache(GetCurrentProcess(), &iat_thunk->u1.Function,
                            sizeof(void *));
      return true;
    }
  }

  return false;
}

std::atomic<bool> g_installed{false};

} // namespace

void cef_hooks::install(HMODULE self) {
  bool expected = false;
  if (!g_installed.compare_exchange_strong(expected, true)) {
    return;
  }

  g_self = self;
  enhancencm_now_playing::initialize(module_directory(self).wstring());

  HMODULE libcef = GetModuleHandleW(L"libcef.dll");
  if (!libcef) {
    g_installed.store(false);
    return;
  }

  g_userfree_free = reinterpret_cast<userfree_free_fn>(
      GetProcAddress(libcef, "cef_string_userfree_utf16_free"));
  g_utf8_to_utf16 = reinterpret_cast<utf8_to_utf16_fn>(
      GetProcAddress(libcef, "cef_string_utf8_to_utf16"));
  g_utf16_clear = reinterpret_cast<utf16_clear_fn>(
      GetProcAddress(libcef, "cef_string_utf16_clear"));
  g_create_object = reinterpret_cast<decltype(g_create_object)>(
      GetProcAddress(libcef, "cef_v8value_create_object"));
  g_create_function = reinterpret_cast<decltype(g_create_function)>(
      GetProcAddress(libcef, "cef_v8value_create_function"));
  g_create_int = reinterpret_cast<decltype(g_create_int)>(
      GetProcAddress(libcef, "cef_v8value_create_int"));

  g_create_string = reinterpret_cast<decltype(g_create_string)>(GetProcAddress(libcef, "cef_v8value_create_string"));

  void *original = nullptr;
  if (!patch_iat(L"cloudmusic.dll", "libcef.dll", "cef_execute_process",
                 reinterpret_cast<void *>(&hooked_execute_process),
                 &original)) {
    append_log("cef_execute_process IAT patch failed");
    g_installed.store(false);
    return;
  }

  g_origin_execute_process =
      reinterpret_cast<decltype(g_origin_execute_process)>(original);
  append_log("cef_execute_process hooked");
}
