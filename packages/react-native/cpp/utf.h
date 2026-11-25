#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>

namespace larkx::host {

// Standard UTF-8. JNI's GetStringUTFChars and NewStringUTF use modified
// UTF-8, which encodes supplementary characters as surrogate pairs and a
// NUL as the two-byte sequence C0 80. The core stores the bytes it is given.

std::string utf16_to_utf8(const char16_t* data, size_t length);
std::u16string utf8_to_utf16(std::string_view utf8);

}  // namespace larkx::host
