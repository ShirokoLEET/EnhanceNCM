#if defined(_M_X64)
#include "core/script.h"
#endif

#include "enhancencm.h"

#if defined(_M_X64)

#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <memory>
#include <string>
#include <thread>

#include <fmt/base.h>

namespace {

std::atomic<bool> g_stop{false};

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

void evaluate(chromatic::script::runtime &runtime,
              const std::filesystem::path &path, bool reset_first) {
  std::string content = read_file(path);
  if (content.empty()) {
    return;
  }

  if (reset_first) {
    runtime.reset();
  }

  // The returned qjs::Value must also be destroyed on the JS thread.
  runtime.context.post_sync([&]() {
    auto result = runtime.eval_script(content, path.string());
    if (!result)
      fmt::print(stderr, "[EnhanceNCM] script error: {}\n", result.error());
  });
}

void watch(chromatic::script::runtime &runtime, const std::filesystem::path &path) {
  std::error_code ec;
  auto last_write = std::filesystem::file_time_type::min();
  if (std::filesystem::exists(path, ec)) {
    last_write = std::filesystem::last_write_time(path, ec);
  }

  while (!g_stop.load()) {
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    if (!std::filesystem::exists(path, ec)) {
      continue;
    }

    auto current = std::filesystem::last_write_time(path, ec);
    if (ec || current == last_write) {
      continue;
    }

    last_write = current;
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    if (!g_stop.load()) evaluate(runtime, path, true);
  }
}

} // namespace

void enhancencm::start(HMODULE module) {
  auto directory = module_directory(module);
  if (directory.empty()) {
    return;
  }

  auto script = directory / L"EnhanceNCM" / L"EnhanceNCM.js";

  // This function runs on DllMain's detached worker. Pin the module for that
  // worker's lifetime; process teardown must not join threads under loader lock.
  HMODULE pinned = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                            GET_MODULE_HANDLE_EX_FLAG_PIN,
                        reinterpret_cast<LPCWSTR>(module), &pinned)) return;
  chromatic::script::runtime runtime;
  runtime.reset();

  if (std::filesystem::exists(script)) {
    evaluate(runtime, script, false);
  } else {
    fmt::print(stderr, "[EnhanceNCM] waiting for script: {}\n",
               script.string());
  }

  watch(runtime, script);
}

void enhancencm::stop() {
  g_stop = true;
  // Safe inside DllMain: no joins, QuickJS calls or heap destruction here.
}

#endif
