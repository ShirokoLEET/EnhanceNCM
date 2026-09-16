#include <windows.h>
#include <cstdlib>
#include <iostream>

int wmain(int argc, wchar_t **argv) {
  _set_error_mode(_OUT_TO_STDERR);
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
  if (argc != 2 || !LoadLibraryW(argv[1])) return 1;
  Sleep(1000); // Give the production worker time to initialize and evaluate JS.
  std::cout << "DLL initialized; exiting process\n";
  return 0;
}
