cmake_minimum_required(VERSION 3.20)
project(larkx_native VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

find_package(SQLite3 REQUIRED)

add_library(larkx_core STATIC
  core/src/json.cpp
  core/src/transitions.cpp
  core/src/reducer.cpp
  core/src/sqlite_store.cpp
  core/src/abi.cpp
)
target_include_directories(larkx_core
  PUBLIC abi/include
  PRIVATE core/include
)
target_link_libraries(larkx_core PUBLIC SQLite::SQLite3)
target_compile_options(larkx_core PRIVATE -Wall -Wextra -Werror -Wpedantic)

add_executable(larkx_core_tests core/tests/core_tests.cpp)
target_include_directories(larkx_core_tests PRIVATE core/include)
target_link_libraries(larkx_core_tests PRIVATE larkx_core)
target_compile_definitions(larkx_core_tests PRIVATE LARKX_FIXTURE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/conformance/transitions.json")
target_compile_options(larkx_core_tests PRIVATE -Wall -Wextra -Werror -Wpedantic)

enable_testing()
add_test(NAME larkx_core_tests COMMAND larkx_core_tests)
