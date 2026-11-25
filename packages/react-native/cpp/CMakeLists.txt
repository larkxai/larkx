cmake_minimum_required(VERSION 3.20)
project(larkx_host_tests LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../../native" "${CMAKE_CURRENT_BINARY_DIR}/native")

find_package(Threads REQUIRED)
add_executable(larkx_host_tests host_tests.cpp utf.cpp session_registry.cpp host_session.cpp)
target_include_directories(larkx_host_tests PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../native/abi/include"
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../native/core/include"
)
target_link_libraries(larkx_host_tests PRIVATE larkx_core Threads::Threads)
target_compile_options(larkx_host_tests PRIVATE -Wall -Wextra -Werror -Wpedantic)
