#include "utf.h"

namespace larkx::host {
namespace {

constexpr char16_t kReplacement = 0xFFFD;

void append_utf8(std::string& out, char32_t code) {
  if (code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) {
    code = kReplacement;
  }
  if (code < 0x80) {
    out.push_back(static_cast<char>(code));
  } else if (code < 0x800) {
    out.push_back(static_cast<char>(0xC0 | (code >> 6)));
    out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
  } else if (code < 0x10000) {
    out.push_back(static_cast<char>(0xE0 | (code >> 12)));
    out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
    out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
  } else {
    out.push_back(static_cast<char>(0xF0 | (code >> 18)));
    out.push_back(static_cast<char>(0x80 | ((code >> 12) & 0x3F)));
    out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
    out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
  }
}

void append_utf16(std::u16string& out, char32_t code) {
  if (code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) {
    out.push_back(kReplacement);
    return;
  }
  if (code < 0x10000) {
    out.push_back(static_cast<char16_t>(code));
    return;
  }
  const char32_t value = code - 0x10000;
  out.push_back(static_cast<char16_t>(0xD800 + (value >> 10)));
  out.push_back(static_cast<char16_t>(0xDC00 + (value & 0x3FF)));
}

bool continuation(unsigned char byte) { return (byte & 0xC0) == 0x80; }

}  // namespace

std::string utf16_to_utf8(const char16_t* data, size_t length) {
  std::string out;
  out.reserve(length);
  for (size_t index = 0; index < length; index += 1) {
    const char16_t unit = data[index];
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      if (index + 1 < length) {
        const char16_t low = data[index + 1];
        if (low >= 0xDC00 && low <= 0xDFFF) {
          const char32_t code = 0x10000 + ((static_cast<char32_t>(unit - 0xD800) << 10) | (low - 0xDC00));
          append_utf8(out, code);
          index += 1;
          continue;
        }
      }
      append_utf8(out, kReplacement);
      continue;
    }
    if (unit >= 0xDC00 && unit <= 0xDFFF) {
      append_utf8(out, kReplacement);
      continue;
    }
    append_utf8(out, unit);
  }
  return out;
}

std::u16string utf8_to_utf16(std::string_view utf8) {
  std::u16string out;
  out.reserve(utf8.size());
  size_t index = 0;
  while (index < utf8.size()) {
    const auto lead = static_cast<unsigned char>(utf8[index]);
    int width = 0;
    char32_t code = 0;
    char32_t minimum = 0;
    if (lead < 0x80) {
      append_utf16(out, lead);
      index += 1;
      continue;
    }
    if ((lead & 0xE0) == 0xC0) {
      width = 2;
      code = lead & 0x1F;
      minimum = 0x80;
    } else if ((lead & 0xF0) == 0xE0) {
      width = 3;
      code = lead & 0x0F;
      minimum = 0x800;
    } else if ((lead & 0xF8) == 0xF0) {
      width = 4;
      code = lead & 0x07;
      minimum = 0x10000;
    } else {
      append_utf16(out, kReplacement);
      index += 1;
      continue;
    }
    if (index + static_cast<size_t>(width) > utf8.size()) {
      append_utf16(out, kReplacement);
      break;
    }
    bool valid = true;
    for (int byte = 1; byte < width; byte += 1) {
      const auto next = static_cast<unsigned char>(utf8[index + static_cast<size_t>(byte)]);
      if (!continuation(next)) {
        valid = false;
        break;
      }
      code = (code << 6) | (next & 0x3F);
    }
    if (!valid) {
      append_utf16(out, kReplacement);
      index += 1;
      continue;
    }
    if (code < minimum || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) {
      append_utf16(out, kReplacement);
      index += static_cast<size_t>(width);
      continue;
    }
    append_utf16(out, code);
    index += static_cast<size_t>(width);
  }
  return out;
}

}  // namespace larkx::host
