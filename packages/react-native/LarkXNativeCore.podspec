require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
vendor = File.join(__dir__, "vendor/larkx")

Pod::Spec.new do |spec|
  spec.name = "LarkXNativeCore"
  spec.version = package["version"]
  spec.summary = "React Native binding to the shared LarkX C++ core"
  spec.homepage = package["homepage"]
  spec.license = package["license"]
  spec.authors = "LarkX"
  spec.platforms = { :ios => "15.1" }
  spec.source = { :git => "https://github.com/larkxai/larkx.git", :tag => spec.version.to_s }
  spec.source_files = [
    "ios/LarkXNativeCore.mm",
    "cpp/host_session.cpp",
    "cpp/host_session.h",
    "cpp/utf.cpp",
    "cpp/utf.h",
    "vendor/larkx/core/src/*.{cpp,hpp}",
    "vendor/larkx/abi/include/*.h",
    "vendor/larkx/core/include/**/*.hpp",
  ]
  spec.private_header_files = [
    "cpp/host_session.h",
    "vendor/larkx/core/include/**/*.hpp",
  ]
  spec.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "CLANG_CXX_LIBRARY" => "libc++",
    "GCC_ENABLE_CPP_EXCEPTIONS" => "YES",
    "GCC_ENABLE_CPP_RTTI" => "YES",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_TARGET_SRCROOT)/cpp\" \"$(PODS_TARGET_SRCROOT)/vendor/larkx/abi/include\" \"$(PODS_TARGET_SRCROOT)/vendor/larkx/core/include\"",
  }
  spec.libraries = "sqlite3"
  spec.dependency "React-Core"
  spec.prepare_command = "node scripts/vendor-native.mjs"
  if !File.exist?(File.join(vendor, "core/src/agent.cpp"))
    Pod::UI.warn("LarkX native sources are missing. pod install runs scripts/vendor-native.mjs before the build.")
  end
end
