if(NOT APPLE)
  message(FATAL_ERROR
    "The iOS toolchain requires an Apple host with Xcode. "
    "This environment cannot produce an iOS binary.")
endif()

if(NOT DEFINED CMAKE_OSX_SYSROOT)
  set(CMAKE_SYSTEM_NAME iOS)
  set(CMAKE_OSX_DEPLOYMENT_TARGET 15.0 CACHE STRING "Minimum iOS version")
endif()
