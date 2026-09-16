#include "../src/inject/theme_files.h"
#include <iostream>
int main(int argc, char **argv) {
  if (argc != 2) return 1;
  std::cout << enhancencm_themes::catalog(std::filesystem::u8path(argv[1]));
}
