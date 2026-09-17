#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <bcrypt.h>
#include <wincrypt.h>
#include <winhttp.h>

#include "now_playing_service.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <condition_variable>
#include <cctype>
#include <charconv>
#include <chrono>
#include <climits>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iomanip>
#include <memory>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "winhttp.lib")

namespace enhancencm_now_playing {
namespace {

constexpr unsigned short kPort = 9863;
constexpr size_t kMaxHeader = 64 * 1024;
constexpr size_t kMaxRequestBody = 2 * 1024 * 1024;
constexpr size_t kMaxCoverBytes = 8 * 1024 * 1024;
constexpr char kDefaultTemplate[] = "{author} - {title}";
constexpr char kWebSocketGuid[] = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

constexpr char kEmptyPlayer[] =
    "{\"hasSong\":false,\"isPaused\":true,\"volumePercent\":0,"
    "\"seekbarCurrentPosition\":0,\"seekbarCurrentPositionHuman\":\"0:00\","
    "\"statePercent\":0,\"likeStatus\":\"INDIFFERENT\",\"repeatType\":\"NONE\"}";
constexpr char kEmptyTrack[] =
    "{\"author\":\"\",\"title\":\"\",\"album\":\"\",\"cover\":\"\","
    "\"duration\":0,\"durationHuman\":\"0:00\",\"url\":\"\",\"id\":\"\","
    "\"isVideo\":false,\"isAdvertisement\":false,\"inLibrary\":false}";
constexpr char kEmptyProgress[] = "{\"progress\":0}";
constexpr char kEmptyLyric[] =
    "{\"source\":\"\",\"title\":\"\",\"author\":\"\",\"duration\":0,"
    "\"hasLyric\":false,\"hasTranslatedLyric\":false,\"hasKaraokeLyric\":false,"
    "\"lrc\":\"\",\"translatedLyric\":\"\",\"karaokeLyric\":\"\"}";
constexpr char kDefaultSettingsGeneral[] =
    "{\"deviceId\":\"default\",\"deviceName\":\"主声音驱动程序\","
    "\"platform\":\"netease\",\"autoLaunchHomePage\":true,\"runAtStartup\":false,"
    "\"updateCheckFreq\":0,\"smtc\":true,\"fallbackPlatformEnabled\":false,"
    "\"fallbackPlatform\":\"netease\",\"pollInterval\":100,\"weSingCachePath\":\"\"}";
constexpr char kDefaultLyricCommonSettings[] =
    "{\"lyricSource\":\"netease\",\"autoSelectBestLyric\":true}";
constexpr char kDefaultVirtualCameraSettings[] =
    "{\"enabled\":false,\"installed\":false,\"content\":\"song\","
    "\"resolution\":\"720p\",\"width\":1280,\"height\":720,\"fps\":60}";
constexpr char kDefaultWindowWidgetSettings[] =
    "{\"songWindow\":{\"enabled\":false,\"width\":800,\"height\":600},"
    "\"lyricWindow\":{\"enabled\":false,\"width\":800,\"height\":600},"
    "\"customWindow\":{\"enabled\":false,\"width\":800,\"height\":600}}";

std::mutex g_root_mutex;
std::wstring g_module_directory;
std::atomic<unsigned long long> g_temp_sequence{0};

struct Peer {
  SOCKET socket = INVALID_SOCKET;
  std::mutex send_mutex;
  std::atomic<bool> closed{false};
};

struct OutputJob {
  bool enabled = false;
  bool force = false;
  unsigned long long generation = 0;
  std::string track;
  std::string player;
  std::string output_template;
};

struct Service {
  std::mutex mutex;
  std::condition_variable condition;
  bool sockets_ready = false;
  bool web_api = false;
  bool file_output = false;
  SOCKET listener = INVALID_SOCKET;
  std::wstring module_directory;

  std::string query_json = std::string("{\"player\":") + kEmptyPlayer +
      ",\"track\":" + kEmptyTrack + "}";
  std::string player_json = kEmptyPlayer;
  std::string track_json = kEmptyTrack;
  std::string progress_json = kEmptyProgress;
  std::string lyric_json = kEmptyLyric;
  std::string pause_json = kEmptyPlayer;

  bool settings_loaded = false;
  std::string output_template = kDefaultTemplate;
  bool output_pending = false;
  OutputJob pending_output;
  unsigned long long generation = 0;
  std::vector<std::shared_ptr<Peer>> peers;
  std::thread server_thread;
  std::thread output_thread;

  Service();
};

struct Snapshot {
  std::string query;
  std::string player;
  std::string track;
  std::string progress;
  std::string lyric;
  std::string pause;
  std::string output_template;
  std::wstring module_directory;
};

struct HttpRequest {
  std::string method;
  std::string target;
  std::unordered_map<std::string, std::string> headers;
  std::string body;
};

struct HttpResponse {
  int status = 200;
  std::string content_type = "application/json; charset=utf-8";
  std::string body;
};

struct DownloadedImage {
  std::vector<unsigned char> bytes;
  std::string mime = "image/jpeg";
};

void server_loop(Service *service);
void output_loop(Service *service);
void close_peer(Service *service, const std::shared_ptr<Peer> &peer);

std::string lower_ascii(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char item) {
    return static_cast<char>(std::tolower(item));
  });
  return value;
}

std::string trim_ascii(std::string value) {
  auto is_space = [](unsigned char item) { return std::isspace(item) != 0; };
  value.erase(value.begin(), std::find_if(value.begin(), value.end(), [&](unsigned char item) {
    return !is_space(item);
  }));
  value.erase(std::find_if(value.rbegin(), value.rend(), [&](unsigned char item) {
    return !is_space(item);
  }).base(), value.end());
  return value;
}

std::wstring utf8_to_wide(std::string_view value) {
  if (value.empty()) return {};
  int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                                  static_cast<int>(value.size()), nullptr, 0);
  if (length <= 0) return {};
  std::wstring result(static_cast<size_t>(length), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), length);
  return result;
}

std::string wide_to_utf8(std::wstring_view value) {
  if (value.empty()) return {};
  int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
                                  static_cast<int>(value.size()), nullptr, 0,
                                  nullptr, nullptr);
  if (length <= 0) return {};
  std::string result(static_cast<size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), length,
                      nullptr, nullptr);
  return result;
}

std::filesystem::path root_path(const Service &service) {
  if (!service.module_directory.empty()) return service.module_directory;
  wchar_t buffer[MAX_PATH] = {};
  DWORD length = GetModuleFileNameW(nullptr, buffer, ARRAYSIZE(buffer));
  if (length > 0 && length < ARRAYSIZE(buffer))
    return std::filesystem::path(buffer, buffer + length).parent_path();
  return std::filesystem::current_path();
}

std::filesystem::path settings_directory(const Service &service) {
  return root_path(service) / L"EnhanceNCM" / L"Settings";
}

std::filesystem::path settings_path(const Service &service) {
  return settings_directory(service) / L"settings-output.json";
}

std::filesystem::path now_playing_settings_path(const Service &service) {
  return settings_directory(service) / L"settings.json";
}

std::filesystem::path output_path(const Service &service) {
  // Keep generated files inside the package directory so they travel with
  // EnhanceNCM and do not get mixed with unrelated files beside the DLL.
  return root_path(service) / L"EnhanceNCM" / L"Outputs";
}

bool send_all(SOCKET socket, const void *data, size_t size) {
  auto *bytes = static_cast<const char *>(data);
  while (size > 0) {
    int sent = send(socket, bytes, static_cast<int>(std::min<size_t>(size, INT_MAX)), 0);
    if (sent <= 0) return false;
    bytes += sent;
    size -= static_cast<size_t>(sent);
  }
  return true;
}

bool receive_all(SOCKET socket, void *data, size_t size) {
  auto *bytes = static_cast<char *>(data);
  while (size > 0) {
    int received = recv(socket, bytes, static_cast<int>(std::min<size_t>(size, INT_MAX)), 0);
    if (received <= 0) return false;
    bytes += received;
    size -= static_cast<size_t>(received);
  }
  return true;
}

void set_socket_timeout(SOCKET socket, DWORD milliseconds) {
  setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO,
             reinterpret_cast<const char *>(&milliseconds), sizeof(milliseconds));
  setsockopt(socket, SOL_SOCKET, SO_SNDTIMEO,
             reinterpret_cast<const char *>(&milliseconds), sizeof(milliseconds));
}

bool json_key_position(std::string_view json, std::string_view key, size_t &position) {
  std::string needle = "\"" + std::string(key) + "\"";
  size_t found = json.find(needle);
  if (found == std::string_view::npos) return false;
  found += needle.size();
  while (found < json.size() && std::isspace(static_cast<unsigned char>(json[found]))) ++found;
  if (found >= json.size() || json[found] != ':') return false;
  ++found;
  while (found < json.size() && std::isspace(static_cast<unsigned char>(json[found]))) ++found;
  position = found;
  return found < json.size();
}

void append_unicode(std::string &result, unsigned value) {
  if (value <= 0x7f) {
    result.push_back(static_cast<char>(value));
  } else if (value <= 0x7ff) {
    result.push_back(static_cast<char>(0xc0 | (value >> 6)));
    result.push_back(static_cast<char>(0x80 | (value & 0x3f)));
  } else {
    result.push_back(static_cast<char>(0xe0 | (value >> 12)));
    result.push_back(static_cast<char>(0x80 | ((value >> 6) & 0x3f)));
    result.push_back(static_cast<char>(0x80 | (value & 0x3f)));
  }
}

bool json_string_value(std::string_view json, std::string_view key,
                       std::string &value) {
  size_t position = 0;
  if (!json_key_position(json, key, position) || json[position] != '"') return false;
  ++position;
  value.clear();
  while (position < json.size()) {
    unsigned char item = static_cast<unsigned char>(json[position++]);
    if (item == '"') return true;
    if (item != '\\') {
      value.push_back(static_cast<char>(item));
      continue;
    }
    if (position >= json.size()) return false;
    char escape = json[position++];
    switch (escape) {
    case '"': value.push_back('"'); break;
    case '\\': value.push_back('\\'); break;
    case '/': value.push_back('/'); break;
    case 'b': value.push_back('\b'); break;
    case 'f': value.push_back('\f'); break;
    case 'n': value.push_back('\n'); break;
    case 'r': value.push_back('\r'); break;
    case 't': value.push_back('\t'); break;
    case 'u': {
      if (position + 4 > json.size()) return false;
      unsigned code = 0;
      for (size_t index = 0; index < 4; ++index) {
        char digit = json[position++];
        code <<= 4;
        if (digit >= '0' && digit <= '9') code += static_cast<unsigned>(digit - '0');
        else if (digit >= 'a' && digit <= 'f') code += static_cast<unsigned>(digit - 'a' + 10);
        else if (digit >= 'A' && digit <= 'F') code += static_cast<unsigned>(digit - 'A' + 10);
        else return false;
      }
      append_unicode(value, code);
      break;
    }
    default: return false;
    }
  }
  return false;
}

bool json_number_value(std::string_view json, std::string_view key, double &value) {
  size_t position = 0;
  if (!json_key_position(json, key, position)) return false;
  size_t end = position;
  while (end < json.size() && std::string_view("-+.0123456789eE").find(json[end]) != std::string_view::npos) ++end;
  if (end == position) return false;
  std::string number(json.substr(position, end - position));
  char *parsed_end = nullptr;
  value = std::strtod(number.c_str(), &parsed_end);
  return parsed_end && *parsed_end == '\0' && std::isfinite(value);
}

bool json_bool_value(std::string_view json, std::string_view key, bool fallback = false) {
  size_t position = 0;
  if (!json_key_position(json, key, position)) return fallback;
  if (json.substr(position, 4) == "true") return true;
  if (json.substr(position, 5) == "false") return false;
  return fallback;
}

bool json_bool_value_present(std::string_view json, std::string_view key, bool &value) {
  size_t position = 0;
  if (!json_key_position(json, key, position)) return false;
  if (json.substr(position, 4) == "true") {
    value = true;
    return true;
  }
  if (json.substr(position, 5) == "false") {
    value = false;
    return true;
  }
  return false;
}

std::string json_escape(std::string_view value) {
  std::string result;
  result.reserve(value.size() + 8);
  constexpr char hex[] = "0123456789abcdef";
  for (unsigned char item : value) {
    switch (item) {
    case '"': result += "\\\""; break;
    case '\\': result += "\\\\"; break;
    case '\b': result += "\\b"; break;
    case '\f': result += "\\f"; break;
    case '\n': result += "\\n"; break;
    case '\r': result += "\\r"; break;
    case '\t': result += "\\t"; break;
    default:
      if (item < 0x20) {
        result += "\\u00";
        result.push_back(hex[item >> 4]);
        result.push_back(hex[item & 0xf]);
      } else result.push_back(static_cast<char>(item));
    }
  }
  return result;
}

std::string base64_encode(const unsigned char *data, size_t size) {
  static constexpr char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string result;
  result.reserve((size + 2) / 3 * 4);
  for (size_t index = 0; index < size; index += 3) {
    unsigned value = static_cast<unsigned>(data[index]) << 16;
    if (index + 1 < size) value |= static_cast<unsigned>(data[index + 1]) << 8;
    if (index + 2 < size) value |= data[index + 2];
    result.push_back(alphabet[(value >> 18) & 0x3f]);
    result.push_back(alphabet[(value >> 12) & 0x3f]);
    result.push_back(index + 1 < size ? alphabet[(value >> 6) & 0x3f] : '=');
    result.push_back(index + 2 < size ? alphabet[value & 0x3f] : '=');
  }
  return result;
}

std::string sha1_base64(std::string_view value) {
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA1_ALGORITHM, nullptr, 0) < 0)
    return {};
  std::array<unsigned char, 20> digest{};
  NTSTATUS status = BCryptHash(algorithm, nullptr, 0,
                               reinterpret_cast<PUCHAR>(const_cast<char *>(value.data())),
                               static_cast<ULONG>(value.size()), digest.data(),
                               static_cast<ULONG>(digest.size()));
  BCryptCloseAlgorithmProvider(algorithm, 0);
  if (status < 0) return {};
  return base64_encode(digest.data(), digest.size());
}

std::string image_mime(const std::vector<unsigned char> &bytes) {
  if (bytes.size() >= 8 && bytes[0] == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G')
    return "image/png";
  if (bytes.size() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff)
    return "image/jpeg";
  if (bytes.size() >= 6 && ((std::equal(bytes.begin(), bytes.begin() + 6, "GIF89a") ||
                            std::equal(bytes.begin(), bytes.begin() + 6, "GIF87a"))))
    return "image/gif";
  if (bytes.size() >= 12 && std::equal(bytes.begin(), bytes.begin() + 4, "RIFF") &&
      std::equal(bytes.begin() + 8, bytes.begin() + 12, "WEBP")) return "image/webp";
  return "image/jpeg";
}

bool decode_data_url(std::string_view url, DownloadedImage &image) {
  if (url.substr(0, 5) != "data:") return false;
  size_t separator = url.find(",");
  if (separator == std::string_view::npos || url.substr(0, separator).find(";base64") == std::string_view::npos)
    return false;
  std::string encoded(url.substr(separator + 1));
  DWORD size = 0;
  if (!CryptStringToBinaryA(encoded.c_str(), static_cast<DWORD>(encoded.size()),
                            CRYPT_STRING_BASE64, nullptr, &size, nullptr, nullptr) ||
      size == 0 || size > kMaxCoverBytes) return false;
  image.bytes.resize(size);
  if (!CryptStringToBinaryA(encoded.c_str(), static_cast<DWORD>(encoded.size()),
                            CRYPT_STRING_BASE64, image.bytes.data(), &size, nullptr, nullptr))
    return false;
  image.bytes.resize(size);
  image.mime = image_mime(image.bytes);
  return true;
}

bool download_image(std::string_view url, DownloadedImage &image) {
  if (decode_data_url(url, image)) return true;
  std::wstring wide_url = utf8_to_wide(url);
  if (wide_url.empty()) return false;

  URL_COMPONENTS parts{};
  parts.dwStructSize = sizeof(parts);
  parts.dwSchemeLength = static_cast<DWORD>(-1);
  parts.dwHostNameLength = static_cast<DWORD>(-1);
  parts.dwUrlPathLength = static_cast<DWORD>(-1);
  parts.dwExtraInfoLength = static_cast<DWORD>(-1);
  if (!WinHttpCrackUrl(wide_url.c_str(), static_cast<DWORD>(wide_url.size()), 0, &parts)) return false;
  std::wstring scheme(parts.lpszScheme, parts.dwSchemeLength);
  if (scheme != L"http" && scheme != L"https") return false;

  HINTERNET session = WinHttpOpen(L"EnhanceNCM now-playing/1.0",
                                  WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                  WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!session) return false;
  WinHttpSetTimeouts(session, 3000, 3000, 5000, 5000);
  HINTERNET connection = WinHttpConnect(session, parts.lpszHostName, parts.nPort, 0);
  if (!connection) {
    WinHttpCloseHandle(session);
    return false;
  }
  std::wstring path(parts.lpszUrlPath ? parts.lpszUrlPath : L"/", parts.dwUrlPathLength == static_cast<DWORD>(-1) ? 0 : parts.dwUrlPathLength);
  if (path.empty()) path = L"/";
  if (parts.lpszExtraInfo && parts.dwExtraInfoLength != static_cast<DWORD>(-1))
    path.append(parts.lpszExtraInfo, parts.dwExtraInfoLength);
  DWORD flags = scheme == L"https" ? WINHTTP_FLAG_SECURE : 0;
  HINTERNET request = WinHttpOpenRequest(connection, L"GET", path.c_str(), nullptr,
                                         WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
  bool success = false;
  if (request && WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                                    WINHTTP_NO_REQUEST_DATA, 0, 0, 0) &&
      WinHttpReceiveResponse(request, nullptr)) {
    DWORD status = 0, status_size = sizeof(status);
    WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &status_size,
                        WINHTTP_NO_HEADER_INDEX);
    if (status == 200) {
      std::vector<unsigned char> bytes;
      bool limit_exceeded = false;
      for (;;) {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(request, &available) || available == 0) break;
        if (bytes.size() + available > kMaxCoverBytes) {
          limit_exceeded = true;
          break;
        }
        size_t start = bytes.size();
        bytes.resize(start + available);
        DWORD received = 0;
        if (!WinHttpReadData(request, bytes.data() + start, available, &received)) {
          bytes.clear();
          break;
        }
        bytes.resize(start + received);
        if (received == 0) break;
      }
      if (!limit_exceeded && !bytes.empty()) {
        image.bytes = std::move(bytes);
        image.mime = image_mime(image.bytes);
        success = true;
      }
    }
  }
  if (request) WinHttpCloseHandle(request);
  WinHttpCloseHandle(connection);
  WinHttpCloseHandle(session);
  return success;
}

std::string read_file_utf8(const std::filesystem::path &path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) return {};
  return std::string(std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>());
}

bool write_file_atomic(const std::filesystem::path &path, std::string_view contents) {
  try {
    std::filesystem::create_directories(path.parent_path());
    std::filesystem::path temporary = path;
    temporary += L".tmp." + std::to_wstring(GetCurrentProcessId()) + L"." +
        std::to_wstring(g_temp_sequence.fetch_add(1));
    {
      std::ofstream file(temporary, std::ios::binary | std::ios::trunc);
      if (!file) return false;
      file.write(contents.data(), static_cast<std::streamsize>(contents.size()));
      file.flush();
      if (!file) {
        file.close();
        DeleteFileW(temporary.c_str());
        return false;
      }
    }
    if (!MoveFileExW(temporary.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
      DeleteFileW(temporary.c_str());
      return false;
    }
    return true;
  } catch (...) {
    return false;
  }
}

std::string now_playing_settings_json(bool web_api, bool file_output) {
  return std::string("{\"nowPlaying\":{\"webApi\":") +
      (web_api ? "true" : "false") + ",\"fileOutput\":" +
      (file_output ? "true" : "false") + "}}\n";
}

bool read_now_playing_settings(const Service &service, bool &web_api, bool &file_output) {
  std::string content = read_file_utf8(now_playing_settings_path(service));
  return json_bool_value_present(content, "webApi", web_api) &&
      json_bool_value_present(content, "fileOutput", file_output);
}

bool write_now_playing_settings(Service &service, bool web_api, bool file_output) {
  return write_file_atomic(now_playing_settings_path(service),
                           now_playing_settings_json(web_api, file_output));
}

bool write_binary_atomic(const std::filesystem::path &path,
                         const std::vector<unsigned char> &contents) {
  return write_file_atomic(path, std::string_view(
      reinterpret_cast<const char *>(contents.data()), contents.size()));
}

void remove_file(const std::filesystem::path &path) {
  std::error_code ignored;
  std::filesystem::remove(path, ignored);
}

void ensure_settings(Service &service) {
  std::filesystem::path path;
  {
    std::lock_guard lock(service.mutex);
    if (service.settings_loaded) return;
    path = settings_path(service);
  }
  std::string content = read_file_utf8(path);
  bool needs_write = content.empty();
  if (content.empty()) {
    auto legacy_path = root_path(service) / L"Settings" / L"settings-output.json";
    if (legacy_path != path) {
      std::string legacy = read_file_utf8(legacy_path);
      if (!legacy.empty()) content = std::move(legacy);
    }
  }
  std::string value;
  bool valid = json_string_value(content, "template", value) &&
      value.size() <= 16 * 1024 && value.find('\0') == std::string::npos;
  if (!valid) value = kDefaultTemplate;
  {
    std::lock_guard lock(service.mutex);
    if (!service.settings_loaded) {
      service.output_template = value;
      service.settings_loaded = true;
    }
    value = service.output_template;
  }
  if (needs_write || !valid)
    write_file_atomic(path, std::string("{\"template\":\"") + json_escape(value) + "\"}\n");
}

Snapshot snapshot(Service &service) {
  std::lock_guard lock(service.mutex);
  return {service.query_json, service.player_json, service.track_json,
          service.progress_json, service.lyric_json, service.pause_json,
          service.output_template, service.module_directory};
}

std::string duration_human(double seconds) {
  unsigned long long value = seconds > 0 ? static_cast<unsigned long long>(seconds) : 0;
  return std::to_string(value / 60) + ":" +
      (value % 60 < 10 ? "0" : "") + std::to_string(value % 60);
}

std::string first_author(std::string_view author) {
  size_t separator = author.find('/');
  return trim_ascii(std::string(author.substr(0, separator)));
}

std::string expand_template(std::string_view value,
                            const std::unordered_map<std::string, std::string> &variables) {
  std::string result;
  result.reserve(value.size());
  for (size_t index = 0; index < value.size();) {
    if (value[index] != '{') {
      result.push_back(value[index++]);
      continue;
    }
    size_t close = value.find('}', index + 1);
    if (close == std::string_view::npos) {
      result.append(value.substr(index));
      break;
    }
    std::string key(value.substr(index + 1, close - index - 1));
    bool valid_key = !key.empty() && std::all_of(key.begin(), key.end(), [](unsigned char item) {
      return std::isalnum(item) || item == '_';
    });
    if (!valid_key) result.append(value.substr(index, close - index + 1));
    else {
      auto found = variables.find(key);
      result.append(found == variables.end() ? value.substr(index, close - index + 1) : found->second);
    }
    index = close + 1;
  }
  return result;
}

void clear_outputs(Service &service) {
  auto directory = output_path(service);
  write_file_atomic(directory / L"title.txt", "");
  write_file_atomic(directory / L"author.txt", "");
  write_file_atomic(directory / L"custom.txt", "");
  remove_file(directory / L"cover.jpg");
}

void output_job(Service &service, const OutputJob &job, std::string &last_key) {
  auto directory = output_path(service);
  if (!job.enabled) {
    clear_outputs(service);
    last_key.clear();
    return;
  }

  bool has_song = json_bool_value(job.player, "hasSong", false);
  std::string id;
  std::string title;
  std::string author;
  std::string album;
  std::string cover;
  std::string human;
  double duration = 0;
  json_string_value(job.track, "id", id);
  json_string_value(job.track, "title", title);
  json_string_value(job.track, "author", author);
  json_string_value(job.track, "album", album);
  json_string_value(job.track, "cover", cover);
  json_string_value(job.track, "durationHuman", human);
  json_number_value(job.track, "duration", duration);
  if (human.empty()) human = duration_human(duration);
  if (!has_song || id.empty()) {
    clear_outputs(service);
    last_key.clear();
    return;
  }

  std::unordered_map<std::string, std::string> variables = {
      {"author", author}, {"title", title}, {"album", album},
      {"duration", std::to_string(static_cast<long long>(std::max(0.0, duration)))},
      {"durationHuman", human}, {"firstAuthor", first_author(author)}};
  std::string custom = expand_template(job.output_template, variables);
  write_file_atomic(directory / L"title.txt", title);
  write_file_atomic(directory / L"author.txt", author);
  write_file_atomic(directory / L"custom.txt", custom);

  std::string key = id + "\n" + cover;
  if (job.force || key != last_key) {
    remove_file(directory / L"cover.jpg");
    DownloadedImage image;
    if (!cover.empty() && download_image(cover, image))
      write_binary_atomic(directory / L"cover.jpg", image.bytes);
    last_key = key;
  }
}

std::string header_value(const HttpRequest &request, std::string_view name) {
  auto found = request.headers.find(std::string(name));
  return found == request.headers.end() ? std::string() : found->second;
}

bool read_http_request(SOCKET socket, HttpRequest &request) {
  std::string data;
  std::array<char, 8192> buffer{};
  size_t header_end = std::string::npos;
  while (data.size() <= kMaxHeader &&
         (header_end = data.find("\r\n\r\n")) == std::string::npos) {
    int received = recv(socket, buffer.data(), static_cast<int>(buffer.size()), 0);
    if (received <= 0) return false;
    data.append(buffer.data(), static_cast<size_t>(received));
  }
  if (header_end == std::string::npos || header_end > kMaxHeader) return false;

  std::istringstream stream(data.substr(0, header_end));
  std::string line;
  if (!std::getline(stream, line)) return false;
  if (!line.empty() && line.back() == '\r') line.pop_back();
  std::istringstream first(line);
  std::string protocol;
  if (!(first >> request.method >> request.target >> protocol)) return false;
  while (std::getline(stream, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    size_t separator = line.find(':');
    if (separator == std::string::npos) continue;
    request.headers[lower_ascii(trim_ascii(line.substr(0, separator)))] =
        trim_ascii(line.substr(separator + 1));
  }

  size_t content_length = 0;
  std::string length = header_value(request, "content-length");
  if (!length.empty()) {
    try { content_length = std::stoull(length); }
    catch (...) { return false; }
  }
  if (content_length > kMaxRequestBody) return false;
  size_t body_start = header_end + 4;
  if (data.size() > body_start)
    request.body.assign(data.data() + body_start, data.size() - body_start);
  while (request.body.size() < content_length) {
    size_t remaining = content_length - request.body.size();
    int received = recv(socket, buffer.data(), static_cast<int>(std::min<size_t>(buffer.size(), remaining)), 0);
    if (received <= 0) return false;
    request.body.append(buffer.data(), static_cast<size_t>(received));
  }
  if (request.body.size() > content_length) request.body.resize(content_length);
  return true;
}

void send_http_response(SOCKET socket, const HttpResponse &response) {
  std::string reason = response.status == 200 ? "OK" :
      response.status == 204 ? "No Content" : response.status == 400 ? "Bad Request" :
      response.status == 404 ? "Not Found" : response.status == 405 ? "Method Not Allowed" :
      response.status == 413 ? "Payload Too Large" : "Internal Server Error";
  std::string headers = "HTTP/1.1 " + std::to_string(response.status) + " " + reason +
      "\r\nContent-Type: " + response.content_type +
      "\r\nContent-Length: " + std::to_string(response.body.size()) +
      "\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
      "Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS\r\n"
      "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";
  send_all(socket, headers.data(), headers.size());
  if (!response.body.empty()) send_all(socket, response.body.data(), response.body.size());
}

std::string path_without_query(std::string_view target) {
  size_t separator = target.find('?');
  return std::string(target.substr(0, separator));
}

std::string bool_response(bool value) {
  return std::string("{\"data\":") + (value ? "true" : "false") + "}";
}

std::string output_settings_json(std::string_view value) {
  return std::string("{\"template\":\"") + json_escape(value) + "\"}";
}

std::string app_info_json(const Service &service) {
  std::filesystem::path path = root_path(service);
  return std::string("{\"operatingSystem\":\"Windows\",\"osBit\":") +
      std::to_string(sizeof(void *) * 8) + ",\"installPath\":\"" +
      json_escape(wide_to_utf8(path.wstring())) +
      "\",\"programRunningTime\":\"00:00:00\",\"platform\":\"netease\","
      "\"autoLaunchHomePage\":false,\"runAtStartup\":false,\"updateCheckFreq\":0,"
      "\"smtc\":false,\"fallbackPlatformEnabled\":false,\"fallbackPlatform\":\"netease\","
      "\"pollInterval\":100,\"weSingCachePath\":\"\",\"checkWeSingCachePath\":\"\","
      "\"lyricSource\":\"netease\",\"autoSelectBestLyric\":true}";
}

bool update_output_template(Service &service, std::string value) {
  if (value.size() > 16 * 1024 || value.find('\0') != std::string::npos) return false;
  ensure_settings(service);
  std::filesystem::path path;
  std::string saved_template;
  {
    std::lock_guard lock(service.mutex);
    service.output_template = std::move(value);
    saved_template = service.output_template;
    service.settings_loaded = true;
    path = settings_path(service);
    ++service.generation;
    service.pending_output = {service.file_output, true, service.generation,
                              service.track_json, service.player_json, service.output_template};
    service.output_pending = true;
  }
  write_file_atomic(path, output_settings_json(saved_template) + "\n");
  service.condition.notify_all();
  return true;
}

void reset_output_template(Service &service) {
  update_output_template(service, kDefaultTemplate);
}

HttpResponse route_http(Service &service, const HttpRequest &request) {
  std::string path = path_without_query(request.target);
  if (request.method == "GET") {
    if (path == "/query" || path == "/api/query") {
      auto state = snapshot(service); return {200, "application/json; charset=utf-8", state.query};
    }
    if (path == "/query/progress" || path == "/api/query/progress") {
      auto state = snapshot(service); return {200, "application/json; charset=utf-8", state.progress};
    }
    if (path == "/query/player" || path == "/api/query/player") {
      auto state = snapshot(service); return {200, "application/json; charset=utf-8", state.player};
    }
    if (path == "/query/track" || path == "/api/query/track") {
      auto state = snapshot(service); return {200, "application/json; charset=utf-8", state.track};
    }
    if (path == "/api/query/hasSong" || path == "/api/query/isConnected") {
      auto state = snapshot(service); return {200, "application/json; charset=utf-8",
          bool_response(json_bool_value(state.player, "hasSong", false))};
    }
    if (path == "/api/lyric") {
      auto state = snapshot(service); return {200, "application/json; charset=utf-8", state.lyric};
    }
    if (path == "/api/lyric/settings/common")
      return {200, "application/json; charset=utf-8", kDefaultLyricCommonSettings};
    if (path == "/api/lyric/settings")
      return {200, "application/json; charset=utf-8", "{}"};
    if (path == "/api/settings/output") {
      ensure_settings(service);
      std::lock_guard lock(service.mutex);
      return {200, "application/json; charset=utf-8", output_settings_json(service.output_template)};
    }
    if (path == "/api/settings/output/reset") {
      reset_output_template(service);
      std::lock_guard lock(service.mutex);
      return {200, "application/json; charset=utf-8", output_settings_json(service.output_template)};
    }
    if (path == "/api/audio/devices" || path == "/api/system/networkInterfaces" || path == "/api/system/lanDevices")
      return {200, "application/json; charset=utf-8", "[]"};
    if (path == "/api/audio/deviceDetect")
      return {200, "application/json; charset=utf-8", "{\"success\":false,\"deviceId\":\"\"}"};
    if (path == "/api/settings/general")
      return {200, "application/json; charset=utf-8", kDefaultSettingsGeneral};
    if (path == "/api/settings/plugin/virtualCamera")
      return {200, "application/json; charset=utf-8", kDefaultVirtualCameraSettings};
    if (path == "/api/settings/plugin/windowWidget")
      return {200, "application/json; charset=utf-8", kDefaultWindowWidgetSettings};
    if (path == "/api/settings/plugin/hasVirtualCamera")
      return {200, "application/json; charset=utf-8", "\"no\""};
    if (path == "/api/system/osBit")
      return {200, "application/json; charset=utf-8", std::string("{\"osBit\":") +
          std::to_string(sizeof(void *) * 8) + "}"};
    if (path == "/api/system/logStatus")
      return {200, "application/json; charset=utf-8",
          "{\"mainLogExist\":false,\"desktopLogExist\":false,\"virtualCameraLogExist\":false}"};
    if (path == "/api/system/checkWeSingCachePath")
      return {200, "application/json; charset=utf-8", "{\"data\":\"\"}"};
    if (path == "/api/version")
      return {200, "application/json; charset=utf-8",
          "{\"latestVersion\":\"0.1.0\",\"updateDate\":\"\",\"updateLog\":\"\"}"};
    if (path == "/api/sponsorList" || path == "/api/socialInfo" || path == "/api/announcement")
      return {200, "application/json; charset=utf-8", "{}"};
    if (path == "/api/system/appInfo")
      return {200, "application/json; charset=utf-8", app_info_json(service)};
    if (path == "/api/system/log/mainContent")
      return {200, "application/json; charset=utf-8", "{\"data\":\"\"}"};
    if (path == "/api/system/installPath")
      return {200, "application/json; charset=utf-8", std::string("{\"data\":\"") +
          json_escape(wide_to_utf8(root_path(service).wstring())) + "\"}"};
    if (path == "/auth/check")
      return {200, "application/json; charset=utf-8", "{\"message\":\"User is authorized!\"}"};
    if (path == "/users/profile")
      return {200, "application/json; charset=utf-8", "{\"widgets\":{\"amuse\":{\"music_service\":\"netease\",\"profiles\":[]},\"widget_token\":\"\"},\"_id\":\"\",\"avatar\":\"\",\"has_donated\":false,\"is_discord_member\":false,\"is_subscribed\":false,\"name\":\"EnhanceNCM\",\"creationDate\":\"\"}"};
    if (path == "/widgets/amuse/settings" || path.starts_with("/widgets/amuse/settings/"))
      return {200, "application/json; charset=utf-8", "{\"settings\":{}}"};
    if (path == "/api/cover/videoUrl" || path == "/cover/videoUrl")
      return {200, "application/json; charset=utf-8", "null"};
  }
  if (request.method == "PUT" && (path == "/api/settings/general" ||
      path == "/api/settings/plugin/virtualCamera" || path == "/api/settings/plugin/windowWidget" ||
      path == "/api/lyric/settings" || path == "/api/lyric/settings/common"))
    return {204, "application/json; charset=utf-8", {}};
  if (request.method == "POST" && path == "/widgets/amuse/settings/music-service")
    return {200, "text/plain; charset=utf-8", "Successfully set music service"};
  if (request.method == "POST" && (path == "/widgets/amuse/settings/update/boolean" ||
      path == "/widgets/amuse/settings/update/integer" || path == "/widgets/amuse/settings/update/string"))
    return {200, "text/plain; charset=utf-8", "ok"};
  if (request.method == "GET" && (path == "/api/system/enableRunAtStartup" ||
      path == "/api/system/disableRunAtStartup" || path == "/api/system/openInstallPath" ||
      path == "/api/system/openPublicDir" || path == "/api/system/runDeviceVolumeTest" ||
      path == "/api/system/runSmtcTest" || path == "/api/system/warmUp" ||
      path == "/api/system/restorePublicExample" || path == "/api/system/openLogFile"))
    return {200, "application/json; charset=utf-8", {}};
  if (request.method == "PUT" && path == "/api/settings/output") {
    std::string value;
    if (!json_string_value(request.body, "template", value)) return {400, "application/json; charset=utf-8", "{\"error\":\"invalid template\"}"};
    if (!update_output_template(service, value)) return {400, "application/json; charset=utf-8", "{\"error\":\"template too long\"}"};
    return {204, "application/json; charset=utf-8", {}};
  }
  if (request.method == "POST" && (path == "/cover/convert" || path == "/api/cover/convert")) {
    std::string url;
    if (!json_string_value(request.body, "cover_url", url) && !json_string_value(request.body, "coverUrl", url))
      return {400, "application/json; charset=utf-8", "{\"base64Img\":\"\"}"};
    DownloadedImage image;
    if (!download_image(url, image))
      return {200, "application/json; charset=utf-8", "{\"base64Img\":\"\"}"};
    return {200, "application/json; charset=utf-8", std::string("{\"base64Img\":\"data:") +
        image.mime + ";base64," + base64_encode(image.bytes.data(), image.bytes.size()) + "\"}"};
  }
  if (request.method == "POST" && (path == "/cover/videoUrl" || path == "/api/cover/videoUrl"))
    return {200, "application/json; charset=utf-8", "null"};
  return {request.method == "GET" || request.method == "POST" || request.method == "PUT" ? 404 : 405,
          "application/json; charset=utf-8", "{\"error\":\"not found\"}"};
}

bool send_websocket_text(const std::shared_ptr<Peer> &peer, std::string_view payload) {
  if (peer->closed.load()) return false;
  std::string frame;
  frame.push_back(static_cast<char>(0x81));
  if (payload.size() <= 125) {
    frame.push_back(static_cast<char>(payload.size()));
  } else if (payload.size() <= 0xffff) {
    frame.push_back(126);
    frame.push_back(static_cast<char>((payload.size() >> 8) & 0xff));
    frame.push_back(static_cast<char>(payload.size() & 0xff));
  } else {
    frame.push_back(127);
    unsigned long long size = payload.size();
    for (int shift = 56; shift >= 0; shift -= 8)
      frame.push_back(static_cast<char>((size >> shift) & 0xff));
  }
  frame.append(payload);
  std::lock_guard lock(peer->send_mutex);
  return !peer->closed.load() && send_all(peer->socket, frame.data(), frame.size());
}

void send_websocket_event(const std::shared_ptr<Peer> &peer,
                          std::string_view event, std::string_view data) {
  std::string message = std::string("{\"event\":\"") + json_escape(event) + "\",\"data\":" +
      (data.empty() ? "null" : std::string(data)) + "}";
  if (!send_websocket_text(peer, message)) peer->closed.store(true);
}

void broadcast(Service &service,
               const std::vector<std::pair<std::string, std::string>> &events) {
  std::vector<std::shared_ptr<Peer>> peers;
  {
    std::lock_guard lock(service.mutex);
    if (!service.web_api) return;
    peers = service.peers;
  }
  for (const auto &peer : peers) {
    for (const auto &event : events) {
      if (peer->closed.load() || !send_websocket_text(peer,
          std::string("{\"event\":\"") + json_escape(event.first) + "\",\"data\":" + event.second + "}")) {
        close_peer(&service, peer);
        break;
      }
    }
  }
}

bool read_websocket_frame(SOCKET socket, unsigned char &opcode, std::string &payload) {
  unsigned char header[2] = {};
  if (!receive_all(socket, header, sizeof(header))) return false;
  opcode = header[0] & 0x0f;
  bool masked = (header[1] & 0x80) != 0;
  unsigned long long length = header[1] & 0x7f;
  if (length == 126) {
    unsigned char extended[2] = {};
    if (!receive_all(socket, extended, sizeof(extended))) return false;
    length = (static_cast<unsigned long long>(extended[0]) << 8) | extended[1];
  } else if (length == 127) {
    unsigned char extended[8] = {};
    if (!receive_all(socket, extended, sizeof(extended))) return false;
    length = 0;
    for (unsigned char item : extended) length = (length << 8) | item;
  }
  if (!masked || length > 64 * 1024) return false;
  unsigned char mask[4] = {};
  if (!receive_all(socket, mask, sizeof(mask))) return false;
  payload.resize(static_cast<size_t>(length));
  if (length && !receive_all(socket, payload.data(), payload.size())) return false;
  for (size_t index = 0; index < payload.size(); ++index) payload[index] ^= static_cast<char>(mask[index % 4]);
  return true;
}

void websocket_loop(Service &service, const std::shared_ptr<Peer> &peer) {
  for (;;) {
    unsigned char opcode = 0;
    std::string payload;
    if (!read_websocket_frame(peer->socket, opcode, payload)) break;
    if (opcode == 0x8) break;
    if (opcode == 0x9) {
      std::string frame;
      frame.push_back(static_cast<char>(0x8a));
      frame.push_back(static_cast<char>(payload.size()));
      frame.append(payload);
      std::lock_guard lock(peer->send_mutex);
      if (!send_all(peer->socket, frame.data(), frame.size())) break;
    }
  }
  close_peer(&service, peer);
}

void websocket_connection(Service &service, SOCKET socket, const HttpRequest &request) {
  std::string key = header_value(request, "sec-websocket-key");
  if (key.empty()) {
    send_http_response(socket, {400, "application/json; charset=utf-8", "{\"error\":\"missing websocket key\"}"});
    closesocket(socket);
    return;
  }
  std::string accept = sha1_base64(key + kWebSocketGuid);
  if (accept.empty()) {
    closesocket(socket);
    return;
  }
  std::string response = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n";
  if (!send_all(socket, response.data(), response.size())) {
    closesocket(socket);
    return;
  }
  // The HTTP handshake has a short read deadline, but a WebSocket connection
  // must remain open while the client waits for the next playback event.
  set_socket_timeout(socket, 0);
  auto peer = std::make_shared<Peer>();
  peer->socket = socket;
  {
    std::lock_guard lock(service.mutex);
    service.peers.push_back(peer);
  }
  auto state = snapshot(service);
  send_websocket_event(peer, "Track", state.track);
  send_websocket_event(peer, "Lyric", state.lyric);
  send_websocket_event(peer, "PlayerPauseState", state.pause);
  send_websocket_event(peer, "PlayerProgress", state.progress);
  websocket_loop(service, peer);
}

SOCKET bind_listener() {
  SOCKET listener = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (listener == INVALID_SOCKET) return INVALID_SOCKET;
  BOOL exclusive = TRUE;
  setsockopt(listener, SOL_SOCKET, SO_EXCLUSIVEADDRUSE,
             reinterpret_cast<const char *>(&exclusive), sizeof(exclusive));
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(kPort);
  inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);
  if (bind(listener, reinterpret_cast<sockaddr *>(&address), sizeof(address)) == SOCKET_ERROR ||
      listen(listener, 32) == SOCKET_ERROR) {
    closesocket(listener);
    return INVALID_SOCKET;
  }
  return listener;
}

void client_connection(Service &service, SOCKET socket) {
  set_socket_timeout(socket, 5000);
  HttpRequest request;
  if (!read_http_request(socket, request)) {
    closesocket(socket);
    return;
  }
  std::string path = path_without_query(request.target);
  if (request.method == "OPTIONS") {
    send_http_response(socket, {204, "application/json; charset=utf-8", {}});
    closesocket(socket);
    return;
  }
  std::string upgrade = lower_ascii(header_value(request, "upgrade"));
  std::string connection = lower_ascii(header_value(request, "connection"));
  if (request.method == "GET" && path == "/api/ws/lyric" && upgrade == "websocket" &&
      connection.find("upgrade") != std::string::npos) {
    websocket_connection(service, socket, request);
    return;
  }
  send_http_response(socket, route_http(service, request));
  closesocket(socket);
}

void server_loop(Service *service) {
  for (;;) {
    {
      std::unique_lock lock(service->mutex);
      service->condition.wait(lock, [&] { return service->web_api && service->sockets_ready; });
    }
    SOCKET listener = bind_listener();
    if (listener == INVALID_SOCKET) {
      std::unique_lock lock(service->mutex);
      service->condition.wait_for(lock, std::chrono::seconds(1), [&] { return !service->web_api; });
      continue;
    }
    {
      std::lock_guard lock(service->mutex);
      if (!service->web_api) {
        closesocket(listener);
        continue;
      }
      service->listener = listener;
    }
    for (;;) {
      {
        std::lock_guard lock(service->mutex);
        if (!service->web_api || service->listener != listener) break;
      }
      fd_set readable;
      FD_ZERO(&readable);
      FD_SET(listener, &readable);
      timeval timeout{0, 500000};
      int ready = select(0, &readable, nullptr, nullptr, &timeout);
      if (ready == SOCKET_ERROR) break;
      if (ready == 0) continue;
      SOCKET client = accept(listener, nullptr, nullptr);
      if (client == INVALID_SOCKET) continue;
      try { std::thread(client_connection, std::ref(*service), client).detach(); }
      catch (...) { closesocket(client); }
    }
    {
      std::lock_guard lock(service->mutex);
      if (service->listener == listener) service->listener = INVALID_SOCKET;
    }
    closesocket(listener);
  }
}

void output_loop(Service *service) {
  std::string last_key;
  for (;;) {
    OutputJob job;
    {
      std::unique_lock lock(service->mutex);
      service->condition.wait(lock, [&] { return service->output_pending; });
      job = std::move(service->pending_output);
      service->output_pending = false;
    }
    try { output_job(*service, job, last_key); }
    catch (...) {}
  }
}

Service::Service() {
  WSADATA data{};
  sockets_ready = WSAStartup(MAKEWORD(2, 2), &data) == 0;
  {
    std::lock_guard lock(g_root_mutex);
    module_directory = g_module_directory;
  }
  server_thread = std::thread(server_loop, this);
  output_thread = std::thread(output_loop, this);
}

Service &service_instance() {
  static Service *instance = new Service();
  return *instance;
}

void close_peer(Service *service, const std::shared_ptr<Peer> &peer) {
  if (!peer) return;
  if (!peer->closed.exchange(true)) {
    shutdown(peer->socket, SD_BOTH);
    closesocket(peer->socket);
  }
  std::lock_guard lock(service->mutex);
  service->peers.erase(std::remove_if(service->peers.begin(), service->peers.end(),
      [&](const std::shared_ptr<Peer> &item) { return item == peer; }), service->peers.end());
}

} // namespace

void initialize(std::wstring module_directory) {
  std::lock_guard lock(g_root_mutex);
  g_module_directory = std::move(module_directory);
}

std::string read_settings() {
  auto &service = service_instance();
  bool web_api = false;
  bool file_output = false;
  if (!read_now_playing_settings(service, web_api, file_output)) return {};
  return now_playing_settings_json(web_api, file_output);
}

void configure(bool web_api, bool file_output) {
  auto &service = service_instance();
  if (file_output) ensure_settings(service);
  std::vector<std::shared_ptr<Peer>> close_peers;
  {
    std::lock_guard lock(service.mutex);
    bool file_changed = service.file_output != file_output;
    service.web_api = web_api;
    service.file_output = file_output;
    if (!web_api) {
      close_peers = service.peers;
      service.peers.clear();
    }
    if (file_changed || !file_output) {
      ++service.generation;
      service.pending_output = {file_output, true, service.generation,
                                service.track_json, service.player_json, service.output_template};
      service.output_pending = true;
    }
  }
  write_now_playing_settings(service, web_api, file_output);
  for (const auto &peer : close_peers) close_peer(&service, peer);
  service.condition.notify_all();
}

void publish(std::string_view query_json, std::string_view player_json,
             std::string_view track_json, std::string_view progress_json,
             std::string_view lyric_json, std::string_view pause_json) {
  auto &service = service_instance();
  std::vector<std::pair<std::string, std::string>> events;
  {
    std::lock_guard lock(service.mutex);
    std::string next_player = player_json.empty() ? kEmptyPlayer : std::string(player_json);
    std::string next_track = track_json.empty() ? kEmptyTrack : std::string(track_json);
    std::string next_progress = progress_json.empty() ? kEmptyProgress : std::string(progress_json);
    std::string next_lyric = lyric_json.empty() ? kEmptyLyric : std::string(lyric_json);
    std::string next_pause = pause_json.empty() ? next_player : std::string(pause_json);
    bool track_changed = service.track_json != next_track;
    bool pause_changed =
        json_bool_value(service.pause_json, "hasSong", false) !=
            json_bool_value(next_pause, "hasSong", false) ||
        json_bool_value(service.pause_json, "isPaused", true) !=
            json_bool_value(next_pause, "isPaused", true);
    bool progress_changed = service.progress_json != next_progress;
    bool lyric_changed = service.lyric_json != next_lyric;
    service.query_json = query_json.empty() ? std::string("{\"player\":") + next_player +
        ",\"track\":" + next_track + "}" : std::string(query_json);
    service.player_json = std::move(next_player);
    service.track_json = std::move(next_track);
    service.progress_json = std::move(next_progress);
    service.lyric_json = std::move(next_lyric);
    service.pause_json = std::move(next_pause);
    if (track_changed) events.emplace_back("Track", service.track_json);
    if (lyric_changed) events.emplace_back("Lyric", service.lyric_json);
    if (pause_changed) events.emplace_back("PlayerPauseState", service.pause_json);
    if (progress_changed) events.emplace_back("PlayerProgress", service.progress_json);
    if (service.file_output && track_changed) {
      ++service.generation;
      service.pending_output = {true, false, service.generation,
                                service.track_json, service.player_json, service.output_template};
      service.output_pending = true;
    }
  }
  service.condition.notify_all();
  if (!events.empty()) broadcast(service, events);
}

} // namespace enhancencm_now_playing
