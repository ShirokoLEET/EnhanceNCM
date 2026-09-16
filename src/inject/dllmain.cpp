#include "pch.h"

#include "cef_hooks.h"
#include "enhancencm.h"
#include "msimg32_proxy.h"
#include "smtc_timeline.h"

#include <thread>

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID) {
  switch (ul_reason_for_call) {
  case DLL_PROCESS_ATTACH:
    DisableThreadLibraryCalls(hModule);
    msimg32_proxy::init();
    cef_hooks::install(hModule);
#if defined(_M_X64)
    try {
      std::thread([hModule]() {
        try {
          enhancencm_smtc::start();
          cef_hooks::install(hModule);
          enhancencm::start(hModule);
        } catch (...) {
        }
      }).detach();
    } catch (...) {
    }
#endif
    break;
  case DLL_PROCESS_DETACH:
#if defined(_M_X64)
    enhancencm::stop();
#endif
    break;
  }
  return TRUE;
}
