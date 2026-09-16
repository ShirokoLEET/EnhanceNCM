#pragma once

#include <windows.h>

namespace enhancencm {
// Blocking worker entry; call outside DllMain on a dedicated thread.
void start(HMODULE module);
// Signal only. Safe under loader lock; never joins or destroys a JS runtime.
void stop();
} // namespace enhancencm
