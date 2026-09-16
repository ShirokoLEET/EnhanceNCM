#include "../src/inject/artwork_cache.h"
#include <iostream>
#include <stdexcept>
int main() {
  try { enhancencm_artwork::cache_png(L"not an image"); return 2; } catch (const std::invalid_argument&) {}
  const wchar_t* png=L"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=";
  auto first=enhancencm_artwork::cache_png(png);
  if(first!=enhancencm_artwork::cache_png(png))return 3;
  std::cout<<first<<std::endl;
  std::cin.get();
}
