cmake_minimum_required(VERSION 3.22)
project(larkxnative LANGUAGES C CXX)

if(NOT ANDROID)
  message(FATAL_ERROR "This CMake build produces the Android native library. Use packages/react-native/cpp for the Node addon.")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(LARKX_NATIVE "${CMAKE_CURRENT_LIST_DIR}/../vendor/larkx")
if(NOT EXISTS "${LARKX_NATIVE}/core/src/agent.cpp")
  set(LARKX_NATIVE "${CMAKE_CURRENT_LIST_DIR}/../../../native")
endif()
if(NOT EXISTS "${LARKX_NATIVE}/core/src/agent.cpp")
  message(FATAL_ERROR "The shared LarkX core sources were not found. Run node scripts/vendor-native.mjs.")
endif()

set(SQLITE_VERSION "3450100")
set(SQLITE_URL "https://www.sqlite.org/2024/sqlite-amalgamation-${SQLITE_VERSION}.zip")
set(SQLITE_SHA256 "5592243caf28b2cdef41e6ab58d25d653dfc53deded8450eb66072c929f030c4")
set(SQLITE_ARCHIVE "${CMAKE_BINARY_DIR}/sqlite-amalgamation.zip")
set(SQLITE_SOURCE "${CMAKE_BINARY_DIR}/sqlite-amalgamation-${SQLITE_VERSION}")
if(NOT EXISTS "${SQLITE_SOURCE}/sqlite3.c")
  file(DOWNLOAD "${SQLITE_URL}" "${SQLITE_ARCHIVE}" EXPECTED_HASH "SHA256=${SQLITE_SHA256}" SHOW_PROGRESS)
  file(ARCHIVE_EXTRACT INPUT "${SQLITE_ARCHIVE}" DESTINATION "${CMAKE_BINARY_DIR}")
endif()

add_library(larkxnative SHARED
  "${CMAKE_CURRENT_LIST_DIR}/src/main/cpp/jni.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/../cpp/host_session.cpp"
  "${LARKX_NATIVE}/core/src/json.cpp"
  "${LARKX_NATIVE}/core/src/transitions.cpp"
  "${LARKX_NATIVE}/core/src/reducer.cpp"
  "${LARKX_NATIVE}/core/src/sqlite_store.cpp"
  "${LARKX_NATIVE}/core/src/agent.cpp"
  "${LARKX_NATIVE}/core/src/abi.cpp"
  "${SQLITE_SOURCE}/sqlite3.c"
)

target_include_directories(larkxnative PRIVATE
  "${LARKX_NATIVE}/abi/include"
  "${LARKX_NATIVE}/core/include"
  "${SQLITE_SOURCE}"
)
target_compile_definitions(larkxnative PRIVATE
  SQLITE_THREADSAFE=1
  SQLITE_OMIT_LOAD_EXTENSION
  SQLITE_OMIT_DEPRECATED
  SQLITE_DQS=0
)
target_compile_options(larkxnative PRIVATE
  $<$<COMPILE_LANGUAGE:CXX>:-Wall -Wextra -Werror -Wpedantic -fexceptions -frtti>
  $<$<COMPILE_LANGUAGE:C>:-Wall -Wextra -Wno-unused-parameter>
)
