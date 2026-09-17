#pragma once

#include <string>
#include <string_view>

namespace enhancencm_now_playing {

// The page-side adapter supplies the same JSON payloads exposed by the
// standalone now-playing-service application. The native implementation owns
// the HTTP/WebSocket listener and the OBS-friendly file outputs.
void initialize(std::wstring module_directory);
// Returns the persisted service settings as JSON, or an empty string when no
// usable settings file exists yet.
std::string read_settings();
void configure(bool web_api, bool file_output);
void publish(std::string_view query_json, std::string_view player_json,
             std::string_view track_json, std::string_view progress_json,
             std::string_view lyric_json, std::string_view pause_json);

} // namespace enhancencm_now_playing
