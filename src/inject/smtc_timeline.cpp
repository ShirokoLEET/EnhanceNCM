#include "smtc_timeline.h"

#include <windows.h>
#include <roapi.h>
#include <windows.media.h>
#include <SystemMediaTransportControlsInterop.h>
#include <wrl/client.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <thread>

#pragma comment(lib, "runtimeobject.lib")

namespace enhancencm_smtc {
namespace {
using Microsoft::WRL::ComPtr;
constexpr wchar_t kMappingName[] = L"Local\\EnhanceNCM-SMTC-Timeline-v1";
constexpr LONG kMagic = 0x454E544C;

struct SharedTimeline {
  LONG magic;
  LONG sequence;
  double position;
  double duration;
  LONG active;
};

SharedTimeline* shared_timeline() {
  static SharedTimeline* value = [] {
    HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
                                        sizeof(SharedTimeline), kMappingName);
    if (!mapping) return static_cast<SharedTimeline*>(nullptr);
    bool created = GetLastError() != ERROR_ALREADY_EXISTS;
    auto view = static_cast<SharedTimeline*>(MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0,
                                                           sizeof(SharedTimeline)));
    if (view && created) {
      ZeroMemory(view, sizeof(*view));
      view->magic = kMagic;
    }
    return view;
  }();
  return value && value->magic == kMagic ? value : nullptr;
}

bool browser_process() {
  auto command = GetCommandLineW();
  return command && wcsstr(command, L"--type=") == nullptr;
}

HWND own_window() {
  struct Search { DWORD process; HWND media; HWND window; HWND fallback; } search{GetCurrentProcessId(), nullptr, nullptr, nullptr};
  EnumWindows([](HWND window, LPARAM parameter) -> BOOL {
    auto& value = *reinterpret_cast<Search*>(parameter);
    DWORD process = 0;
    GetWindowThreadProcessId(window, &process);
    if (process == value.process && GetWindow(window, GW_OWNER) == nullptr) {
      if (!value.fallback) value.fallback = window;
      wchar_t class_name[128] = {};
      GetClassNameW(window, class_name, ARRAYSIZE(class_name));
      if (wcsstr(class_name, L"MediaPlayer SMTC window")) {
        value.media = window;
        return FALSE;
      }
      if (!value.window && GetWindowTextLengthW(window) > 0) value.window = window;
    }
    return TRUE;
  }, reinterpret_cast<LPARAM>(&search));
  return search.media ? search.media : (search.window ? search.window : search.fallback);
}

ComPtr<ABI::Windows::Media::ISystemMediaTransportControls2> controls_for(HWND window) {
  HSTRING_HEADER header{};
  HSTRING class_name = nullptr;
  constexpr wchar_t name[] = L"Windows.Media.SystemMediaTransportControls";
  if (FAILED(WindowsCreateStringReference(name, ARRAYSIZE(name) - 1, &header, &class_name))) return {};
  ComPtr<ISystemMediaTransportControlsInterop> interop;
  if (FAILED(RoGetActivationFactory(class_name, IID_PPV_ARGS(&interop)))) return {};
  ComPtr<ABI::Windows::Media::ISystemMediaTransportControls> base;
  if (FAILED(interop->GetForWindow(window, IID_PPV_ARGS(&base)))) return {};
  ComPtr<ABI::Windows::Media::ISystemMediaTransportControls2> result;
  if (FAILED(base.As(&result))) return {};
  return result;
}

HRESULT apply(ABI::Windows::Media::ISystemMediaTransportControls2* controls,
              double position, double duration, bool active) {
  HSTRING_HEADER header{};
  HSTRING class_name = nullptr;
  constexpr wchar_t name[] = L"Windows.Media.SystemMediaTransportControlsTimelineProperties";
  HRESULT result = WindowsCreateStringReference(name, ARRAYSIZE(name) - 1, &header, &class_name);
  if (FAILED(result)) return result;
  ComPtr<IInspectable> instance;
  result = RoActivateInstance(class_name, &instance);
  if (FAILED(result)) return result;
  ComPtr<ABI::Windows::Media::ISystemMediaTransportControlsTimelineProperties> timeline;
  result = instance.As(&timeline);
  if (FAILED(result)) return result;
  duration = active && std::isfinite(duration) ? std::max(0.0, duration) : 0.0;
  position = duration > 0 && std::isfinite(position) ? std::clamp(position, 0.0, duration) : 0.0;
  ABI::Windows::Foundation::TimeSpan start{0};
  ABI::Windows::Foundation::TimeSpan end{static_cast<INT64>(duration * 10000000.0)};
  ABI::Windows::Foundation::TimeSpan current{static_cast<INT64>(position * 10000000.0)};
  if (FAILED(result = timeline->put_StartTime(start)) || FAILED(result = timeline->put_EndTime(end)) ||
      FAILED(result = timeline->put_MinSeekTime(start)) || FAILED(result = timeline->put_MaxSeekTime(end)) ||
      FAILED(result = timeline->put_Position(current))) return result;
  return controls->UpdateTimelineProperties(timeline.Get());
}

// The SMTC window is owned by a separate STA thread in CloudMusic. Calling
// GetForWindow/UpdateTimelineProperties from our worker thread returns S_OK,
// but the proxy does not update the session owned by that STA. A small
// in-process window-procedure shim runs the WinRT calls on the owner thread.
struct TimelineRequest {
  double position;
  double duration;
  bool active;
  HRESULT result;
};

constexpr UINT kTimelineMessage = WM_APP + 0x4E7;
constexpr wchar_t kPreviousProcProperty[] = L"EnhanceNCM.SMTCTimelinePreviousProc";

LRESULT CALLBACK smtc_window_proc(HWND window, UINT message, WPARAM wparam,
                                  LPARAM lparam) {
  if (message == kTimelineMessage) {
    auto* request = reinterpret_cast<TimelineRequest*>(lparam);
    if (!request) return 0;
    thread_local HWND controls_window = nullptr;
    thread_local ComPtr<ABI::Windows::Media::ISystemMediaTransportControls2> controls;
    if (controls_window != window) {
      controls_window = window;
      controls.Reset();
    }
    if (!controls) controls = controls_for(window);
    request->result = controls
        ? apply(controls.Get(), request->position, request->duration, request->active)
        : E_NOINTERFACE;
    if (FAILED(request->result)) controls.Reset();
    return 0;
  }
  auto previous = reinterpret_cast<WNDPROC>(GetPropW(window, kPreviousProcProperty));
  return previous ? CallWindowProcW(previous, window, message, wparam, lparam)
                         : DefWindowProcW(window, message, wparam, lparam);
}

bool hook_window(HWND window) {
  if (!window || !IsWindow(window)) return false;
  auto current = reinterpret_cast<WNDPROC>(GetWindowLongPtrW(window, GWLP_WNDPROC));
  if (current == &smtc_window_proc && GetPropW(window, kPreviousProcProperty)) return true;
  HMODULE pinned = nullptr;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                         GET_MODULE_HANDLE_EX_FLAG_PIN,
                     reinterpret_cast<LPCWSTR>(&smtc_window_proc), &pinned);
  SetLastError(0);
  auto previous = reinterpret_cast<WNDPROC>(SetWindowLongPtrW(
      window, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(&smtc_window_proc)));
  if (!previous && GetLastError() != ERROR_SUCCESS) {
    return false;
  }
  if (!SetPropW(window, kPreviousProcProperty, reinterpret_cast<HANDLE>(previous))) {
    SetWindowLongPtrW(window, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(previous));
    return false;
  }
  return true;
}

HRESULT update_on_window(HWND window, double position, double duration, bool active) {
  if (!hook_window(window)) return E_HANDLE;
  TimelineRequest request{position, duration, active, E_FAIL};
  DWORD_PTR ignored = 0;
  if (!SendMessageTimeoutW(window, kTimelineMessage, 0,
                           reinterpret_cast<LPARAM>(&request),
                           SMTO_ABORTIFHUNG, 1000, &ignored)) {
    return HRESULT_FROM_WIN32(GetLastError() ? GetLastError() : ERROR_TIMEOUT);
  }
  return request.result;
}

void worker() {
  if (!browser_process()) return;
  HRESULT result = RoInitialize(RO_INIT_MULTITHREADED);
  if (FAILED(result)) return;
  auto shared = shared_timeline();
  if (!shared) return;
  HWND window = nullptr;
  LONG applied = -1;
  for (;;) {
    // CloudMusic may recreate its hidden SMTC window when enabling or changing
    // a track. Re-scan so a stale HWND cannot keep receiving successful but
    // ineffective updates.
    if (auto current = own_window(); current && current != window) {
      window = current;
      applied = -1;
    }
    if (!window || !IsWindow(window)) {
      std::this_thread::sleep_for(std::chrono::milliseconds(500)); continue;
    }
    LONG before = shared->sequence;
    if ((before & 1) || before == applied) {
      std::this_thread::sleep_for(std::chrono::milliseconds(100));
      continue;
    }
    double position = shared->position, duration = shared->duration;
    bool active = shared->active != 0;
    MemoryBarrier();
    if (before != shared->sequence) continue;
    result = update_on_window(window, position, duration, active);
    if (SUCCEEDED(result)) applied = before;
    else window = nullptr;
  }
}
}

void start() {
  static std::atomic<bool> started{false};
  bool expected = false;
  if (!started.compare_exchange_strong(expected, true)) return;
  try { std::thread(worker).detach(); } catch (...) {}
}

void publish(double position_seconds, double duration_seconds, bool active) {
  auto shared = shared_timeline();
  if (!shared) return;
  InterlockedIncrement(&shared->sequence);
  shared->position = position_seconds;
  shared->duration = duration_seconds;
  shared->active = active ? 1 : 0;
  MemoryBarrier();
  InterlockedIncrement(&shared->sequence);
}
}
