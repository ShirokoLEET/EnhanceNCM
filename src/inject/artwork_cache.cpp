#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <wincrypt.h>
#include <bcrypt.h>
#include "artwork_cache.h"
#include <array>
#include <deque>
#include <map>
#include <mutex>
#include <thread>
#include <vector>
#include <sstream>
#include <iomanip>
#include <stdexcept>
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "bcrypt.lib")

namespace enhancencm_artwork {
namespace {
constexpr size_t max_png = 1024 * 1024;
struct Cache {
  SOCKET listener = INVALID_SOCKET;
  unsigned short port = 0;
  std::string token;
  std::mutex mutex;
  std::map<std::string, std::vector<unsigned char>> images;
  std::deque<std::string> order;
};
std::string hex(const unsigned char* bytes, size_t size) {
  std::ostringstream stream;
  for (size_t i = 0; i < size; ++i) stream << std::hex << std::setw(2) << std::setfill('0') << unsigned(bytes[i]);
  return stream.str();
}
bool send_all(SOCKET socket, const char* bytes, size_t size) {
  while (size) {
    int sent = send(socket, bytes, static_cast<int>(size), 0);
    if (sent <= 0) return false;
    bytes += sent; size -= sent;
  }
  return true;
}
void serve(Cache* cache) {
  for (;;) {
    SOCKET client = accept(cache->listener, nullptr, nullptr);
    if (client == INVALID_SOCKET) return;
    DWORD timeout = 2000;
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&timeout), sizeof(timeout));
    setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, reinterpret_cast<const char*>(&timeout), sizeof(timeout));
    std::string request; char buffer[1024];
    while (request.size() < 4096 && request.find("\r\n\r\n") == std::string::npos) {
      int read = recv(client, buffer, sizeof(buffer), 0);
      if (read <= 0) break;
      request.append(buffer, read);
    }
    std::istringstream line(request.substr(0, request.find("\r\n")));
    std::string method, target, protocol; line >> method >> target >> protocol;
    std::vector<unsigned char> png;
    bool allowed = method == "GET" || method == "HEAD";
    if (allowed && request.find("\r\n\r\n") != std::string::npos && target.starts_with("/" + cache->token + "/")) {
      std::lock_guard lock(cache->mutex);
      auto found = cache->images.find(target);
      if (found != cache->images.end()) png = found->second;
    }
    std::string status = !allowed ? "405 Method Not Allowed" : png.empty() ? "404 Not Found" : "200 OK";
    std::string headers = "HTTP/1.1 " + status + "\r\nContent-Type: image/png\r\nContent-Length: " + std::to_string(png.size()) +
      "\r\nCache-Control: private, max-age=86400\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";
    if (send_all(client, headers.data(), headers.size()) && method == "GET" && !png.empty())
      send_all(client, reinterpret_cast<const char*>(png.data()), png.size());
    closesocket(client);
  }
}
Cache* get_cache() {
  // Process lifetime: DLL is pinned, and DllMain never joins worker threads.
  static Cache* cache = [] {
    auto result = new Cache();
    WSADATA data{};
    if (WSAStartup(MAKEWORD(2, 2), &data)) throw std::runtime_error("Artwork sockets unavailable");
    std::array<unsigned char, 16> random{};
    if (BCryptGenRandom(nullptr, random.data(), static_cast<ULONG>(random.size()), BCRYPT_USE_SYSTEM_PREFERRED_RNG) < 0)
      throw std::runtime_error("Artwork token unavailable");
    result->token = hex(random.data(), random.size());
    result->listener = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    sockaddr_in address{}; address.sin_family = AF_INET; address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    int length = sizeof(address);
    if (result->listener == INVALID_SOCKET || bind(result->listener, reinterpret_cast<sockaddr*>(&address), length) ||
        getsockname(result->listener, reinterpret_cast<sockaddr*>(&address), &length) || listen(result->listener, 32)) {
      if (result->listener != INVALID_SOCKET) closesocket(result->listener);
      delete result; WSACleanup(); throw std::runtime_error("Artwork listener unavailable");
    }
    result->port = ntohs(address.sin_port);
    std::thread(serve, result).detach();
    return result;
  }();
  return cache;
}
}
std::string cache_png(std::wstring_view data_url) {
  constexpr std::wstring_view prefix = L"data:image/png;base64,";
  if (!data_url.starts_with(prefix) || data_url.size() > max_png * 2) throw std::invalid_argument("Invalid artwork data");
  data_url.remove_prefix(prefix.size());
  DWORD size = 0;
  if (!CryptStringToBinaryW(data_url.data(), static_cast<DWORD>(data_url.size()), CRYPT_STRING_BASE64, nullptr, &size, nullptr, nullptr) || size < 24 || size > max_png)
    throw std::invalid_argument("Invalid artwork PNG");
  std::vector<unsigned char> png(size);
  if (!CryptStringToBinaryW(data_url.data(), static_cast<DWORD>(data_url.size()), CRYPT_STRING_BASE64, png.data(), &size, nullptr, nullptr))
    throw std::invalid_argument("Invalid artwork encoding");
  constexpr unsigned char signature[] = {137,80,78,71,13,10,26,10};
  if (!std::equal(std::begin(signature), std::end(signature), png.begin()) || std::string(png.begin()+12,png.begin()+16) != "IHDR")
    throw std::invalid_argument("Invalid artwork signature");
  auto dimension = [&](size_t offset) { return (unsigned(png[offset])<<24) | (unsigned(png[offset+1])<<16) | (unsigned(png[offset+2])<<8) | png[offset+3]; };
  if (!dimension(16) || !dimension(20) || dimension(16) > 512 || dimension(20) > 512) throw std::invalid_argument("Artwork dimensions exceed limit");
  std::array<unsigned char, 32> digest{};
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) throw std::runtime_error("Artwork hash unavailable");
  auto hashed = BCryptHash(algorithm, nullptr, 0, png.data(), static_cast<ULONG>(png.size()), digest.data(), static_cast<ULONG>(digest.size()));
  BCryptCloseAlgorithmProvider(algorithm, 0);
  if (hashed < 0) throw std::runtime_error("Artwork hash failed");
  auto cache = get_cache();
  auto key = "/" + cache->token + "/" + hex(digest.data(), digest.size()) + ".png";
  {
    std::lock_guard lock(cache->mutex);
    if (!cache->images.contains(key)) {
      while (cache->order.size() >= 32) { cache->images.erase(cache->order.front()); cache->order.pop_front(); }
      cache->images.emplace(key, std::move(png)); cache->order.push_back(key);
    }
  }
  return "http://127.0.0.1:" + std::to_string(cache->port) + key;
}
}
