cmake_minimum_required(VERSION 3.20)
project(larkx_node LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT NODE_INCLUDE)
  execute_process(
    COMMAND node -p "require('node:path').resolve(require('node:path').dirname(process.execPath), '../include/node')"
    OUTPUT_VARIABLE NODE_FROM_BIN
    OUTPUT_STRIP_TRAILING_WHITESPACE
  )
  execute_process(
    COMMAND node -p "process.version"
    OUTPUT_VARIABLE NODE_VERSION
    OUTPUT_STRIP_TRAILING_WHITESPACE
  )
  find_path(NODE_INCLUDE node_api.h
    HINTS
      "${NODE_FROM_BIN}"
      "$ENV{NODE_INCLUDE}"
      "$ENV{HOME}/.nvm/versions/node/${NODE_VERSION}/include/node"
    PATHS /usr/include/node /usr/local/include/node
  )
endif()
if(NOT EXISTS "${NODE_INCLUDE}/node_api.h")
  message(FATAL_ERROR
    "node_api.h was not found. Install Node.js 22.13 or newer headers and set NODE_INCLUDE if they are not beside the node binary.")
endif()

set(LARKX_CORE "${CMAKE_CURRENT_SOURCE_DIR}/../../../native")
set(LARKX_HOST "${CMAKE_CURRENT_SOURCE_DIR}/../../react-native/cpp")
if(NOT EXISTS "${LARKX_CORE}/core/src/agent.cpp")
  set(LARKX_CORE "${CMAKE_CURRENT_SOURCE_DIR}/vendor/larkx")
  set(LARKX_HOST "${CMAKE_CURRENT_SOURCE_DIR}/vendor/host")
endif()
if(NOT EXISTS "${LARKX_CORE}/core/src/agent.cpp" OR NOT EXISTS "${LARKX_HOST}/host_session.cpp")
  message(FATAL_ERROR
    "The shared LarkX core was not found. In a published package, run from a tarball whose native/vendor directory was packed. In this repository, the sources live in native/ and packages/react-native/cpp.")
endif()

set(CMAKE_POSITION_INDEPENDENT_CODE ON)
add_subdirectory("${LARKX_CORE}" "${CMAKE_CURRENT_BINARY_DIR}/larkx-core")

add_library(larkx_native SHARED
  "${LARKX_HOST}/node_binding.cpp"
  "${LARKX_HOST}/host_session.cpp"
)
set_target_properties(larkx_native PROPERTIES
  PREFIX ""
  SUFFIX ".node"
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../build"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../build"
)
target_include_directories(larkx_native PRIVATE
  "${NODE_INCLUDE}"
  "${LARKX_HOST}"
  "${LARKX_CORE}/abi/include"
  "${LARKX_CORE}/core/include"
)
target_link_libraries(larkx_native PRIVATE larkx_core)
target_compile_options(larkx_native PRIVATE -Wall -Wextra -Werror -Wpedantic)
if(APPLE)
  target_link_options(larkx_native PRIVATE -undefined dynamic_lookup)
endif()
