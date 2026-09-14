#include "pch.h"

#include "msimg32_proxy.h"

#include <string>

namespace {

using alpha_blend_fn = BOOL(WINAPI *)(HDC, int, int, int, int, HDC, int, int,
                                      int, int, BLENDFUNCTION);
using gradient_fill_fn = BOOL(WINAPI *)(HDC, PTRIVERTEX, ULONG, PVOID, ULONG,
                                        ULONG);
using transparent_blt_fn = BOOL(WINAPI *)(HDC, int, int, int, int, HDC, int,
                                          int, int, int, UINT);
using dll_initialize_fn = BOOL(WINAPI *)(HMODULE, DWORD);
using v_set_ddraw_flag_fn = void(WINAPI *)(void);

HMODULE g_real_msimg32 = nullptr;
alpha_blend_fn g_alpha_blend = nullptr;
gradient_fill_fn g_gradient_fill = nullptr;
transparent_blt_fn g_transparent_blt = nullptr;
dll_initialize_fn g_dll_initialize = nullptr;
v_set_ddraw_flag_fn g_v_set_ddraw_flag = nullptr;

} // namespace

void msimg32_proxy::init() {
  if (g_real_msimg32) {
    return;
  }

  wchar_t system_dir[MAX_PATH] = {};
  if (GetSystemDirectoryW(system_dir, MAX_PATH) == 0) {
    return;
  }

  std::wstring path = system_dir;
  path += L"\\msimg32.dll";

  g_real_msimg32 = LoadLibraryW(path.c_str());
  if (!g_real_msimg32) {
    return;
  }

  g_alpha_blend = reinterpret_cast<alpha_blend_fn>(
      GetProcAddress(g_real_msimg32, "AlphaBlend"));
  g_gradient_fill = reinterpret_cast<gradient_fill_fn>(
      GetProcAddress(g_real_msimg32, "GradientFill"));
  g_transparent_blt = reinterpret_cast<transparent_blt_fn>(
      GetProcAddress(g_real_msimg32, "TransparentBlt"));
  g_dll_initialize = reinterpret_cast<dll_initialize_fn>(
      GetProcAddress(g_real_msimg32, "DllInitialize"));
  g_v_set_ddraw_flag = reinterpret_cast<v_set_ddraw_flag_fn>(
      GetProcAddress(g_real_msimg32, "vSetDdrawflag"));
}

extern "C" BOOL WINAPI proxy_AlphaBlend(HDC hdcDest, int xDest, int yDest,
                                        int wDest, int hDest, HDC hdcSrc,
                                        int xSrc, int ySrc, int wSrc, int hSrc,
                                        BLENDFUNCTION ftn) {
  if (!g_alpha_blend) {
    return FALSE;
  }
  return g_alpha_blend(hdcDest, xDest, yDest, wDest, hDest, hdcSrc, xSrc, ySrc,
                       wSrc, hSrc, ftn);
}

extern "C" BOOL WINAPI proxy_GradientFill(HDC hdc, PTRIVERTEX pVertex,
                                          ULONG nVertex, PVOID pMesh,
                                          ULONG nMesh, ULONG ulMode) {
  if (!g_gradient_fill) {
    return FALSE;
  }
  return g_gradient_fill(hdc, pVertex, nVertex, pMesh, nMesh, ulMode);
}

extern "C" BOOL WINAPI proxy_TransparentBlt(HDC hdcDest, int xDest, int yDest,
                                            int wDest, int hDest, HDC hdcSrc,
                                            int xSrc, int ySrc, int wSrc,
                                            int hSrc, UINT crTransparent) {
  if (!g_transparent_blt) {
    return FALSE;
  }
  return g_transparent_blt(hdcDest, xDest, yDest, wDest, hDest, hdcSrc, xSrc,
                           ySrc, wSrc, hSrc, crTransparent);
}

extern "C" BOOL WINAPI proxy_DllInitialize(HMODULE hModule, DWORD reason) {
  if (!g_dll_initialize) {
    return TRUE;
  }
  return g_dll_initialize(hModule, reason);
}

extern "C" void WINAPI proxy_vSetDdrawflag(void) {
  if (g_v_set_ddraw_flag) {
    g_v_set_ddraw_flag();
  }
}
