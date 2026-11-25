cmake_minimum_required(VERSION 3.20)
project(larkx_rn_node LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT NODE_INCLUDE)
  execute_process(
    COMMAND node -p "require('node:path').resolve(require('node:path').dirname(process.execPath), '../include/node')"
    OUTPUT_VARIABLE NODE_FROM_BIN
    OUTPUT_STRIP_TRAILING_WHITESPACE
  )
  find_path(NODE_INCLUDE node_api.h
    HINTS "${NODE_FROM_BIN}" "$ENV{NODE_INCLUDE}"
    PATHS /usr/include/node /usr/local/include/node
  )
endif()
if(NOT EXISTS "${NODE_INCLUDE}/node_api.h")
  message(FATAL_ERROR "node_api.h was not found. Set NODE_INCLUDE to the Node.js headers.")
endif()

set(CMAKE_POSITION_INDEPENDENT_CODE ON)
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../../native" "${CMAKE_CURRENT_BINARY_DIR}/native")

add_library(larkx_native SHARED node_binding.cpp host_session.cpp)
set_target_properties(larkx_native PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(larkx_native PRIVATE
  "${NODE_INCLUDE}"
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../native/abi/include"
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../native/core/include"
)
target_link_libraries(larkx_native PRIVATE larkx_core)
target_compile_options(larkx_native PRIVATE -Wall -Wextra -Werror -Wpedantic)
if(APPLE)
  target_link_options(larkx_native PRIVATE -undefined dynamic_lookup)
endif()

find_package(Threads REQUIRED)
add_executable(larkx_host_tests host_tests.cpp utf.cpp session_registry.cpp host_session.cpp)
target_include_directories(larkx_host_tests PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../native/abi/include"
  "${CMAKE_CURRENT_SOURCE_DIR}/../../../native/core/include"
)
target_link_libraries(larkx_host_tests PRIVATE larkx_core Threads::Threads)
target_compile_options(larkx_host_tests PRIVATE -Wall -Wextra -Werror -Wpedantic)
