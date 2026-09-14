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

std::unique_ptr<chromatic::script::runtime> g_runtime;
std::atomic<bool> g_stop{false};
std::thread g_watcher;

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

void evaluate(const std::filesystem::path &path, bool reset_first) {
  if (!g_runtime) {
    return;
  }

  std::string content = read_file(path);
  if (content.empty()) {
    return;
  }

  if (reset_first) {
    g_runtime->reset();
  }

  auto result = g_runtime->eval_script(content, path.string());
  if (!result) {
    fmt::print(stderr, "[EnhanceNCM] script error: {}\n", result.error());
  }
}

void watch(const std::filesystem::path &path) {
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
    evaluate(path, true);
  }
}

} // namespace

void enhancencm::start(HMODULE module) {
  auto directory = module_directory(module);
  if (directory.empty()) {
    return;
  }

  auto script = directory / L"EnhanceNCM.js";

  g_runtime = std::make_unique<chromatic::script::runtime>();
  g_runtime->reset();

  if (std::filesystem::exists(script)) {
    evaluate(script, false);
  } else {
    fmt::print(stderr, "[EnhanceNCM] waiting for script: {}\n",
               script.string());
  }

  g_stop = false;
  g_watcher = std::thread([script]() { watch(script); });
}

void enhancencm::stop() {
  g_stop = true;
  if (g_watcher.joinable()) {
    g_watcher.join();
  }
  g_runtime.reset();
}

#endif
