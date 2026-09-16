#pragma once
#include <string>
#include <string_view>

// Publish a small rendered PNG to the client's HTTP image-cache loader.
// Memory-only, loopback-only, GET/HEAD-only; no filesystem or upload API.
namespace enhancencm_artwork {
std::string cache_png(std::wstring_view data_url);
}
