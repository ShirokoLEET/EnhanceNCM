#pragma once
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>
#include <system_error>

namespace enhancencm_themes {
inline std::string quote(const std::string &value) {
  std::string result = "\"";
  const char hex[] = "0123456789abcdef";
  for (unsigned char c : value) {
    if (c == '"' || c == '\\') { result += '\\'; result += c; }
    else if (c < 0x20) { result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15]; }
    else result += c;
  }
  return result + '"';
}

// Each direct child is a theme. Read errors stay visible in the theme picker.
inline std::string catalog(const std::filesystem::path &root) {
  std::string result = "[";
  std::error_code ec;
  std::filesystem::directory_iterator it(root, ec), end;
  bool first = true;
  for (; !ec && it != end; it.increment(ec)) {
    std::error_code status_error;
    if (!it->is_directory(status_error)) continue;
    const auto utf8 = it->path().filename().u8string();
    std::string name(utf8.begin(), utf8.end());
    std::string id = name;
    // Keep the existing persisted default ID across the directory migration.
    if (_stricmp(id.c_str(), "spotify") == 0) id = "spotify";
    std::string source, error;
    const auto entry = it->path() / L"theme.js";
    auto size = std::filesystem::file_size(entry, status_error);
    if (status_error) error = "Missing or unreadable theme.js";
    else if (size > 8 * 1024 * 1024) error = "theme.js exceeds 8 MiB";
    else {
      std::ifstream file(entry, std::ios::binary);
      source.assign(std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>());
      if (!file || source.empty()) error = "Empty or unreadable theme.js";
    }
    if (!first) result += ',';
    first = false;
    result += "{\"id\":" + quote(id) + ",\"name\":" + quote(name) +
              ",\"source\":" + quote(source) + ",\"error\":" + quote(error) + "}";
  }
  return result + "]";
}
} // namespace enhancencm_themes
