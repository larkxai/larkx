if(NOT DEFINED ANDROID_NDK)
  message(FATAL_ERROR
    "ANDROID_NDK is not set. This host cannot produce an Android native binary. "
    "Set ANDROID_NDK to an NDK that contains build/cmake/android.toolchain.cmake.")
endif()

include(${ANDROID_NDK}/build/cmake/android.toolchain.cmake)
