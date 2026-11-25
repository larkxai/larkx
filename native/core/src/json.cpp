#include "larkx/json.hpp"

#include <algorithm>
#include <cstdio>
#include <string>

namespace larkx {
namespace {

constexpr int kMaxDepth = 64;

struct Parser {
  std::string_view in;
  size_t i = 0;
  int depth = 0;
  std::string error;

  void skip() {
    while (i < in.size()) {
      const char c = in[i];
      if (c != ' ' && c != '\n' && c != '\r' && c != '\t') {
        break;
      }
      i += 1;
    }
  }

  bool fail(const char* message) {
    error = message;
    return false;
  }

  bool consume(char expected) {
    skip();
    if (i >= in.size() || in[i] != expected) {
      return fail("JSON syntax is invalid.");
    }
    i += 1;
    return true;
  }

  bool parse_value(Json& out) {
    skip();
    if (i >= in.size()) {
      return fail("JSON value is incomplete.");
    }
    const char c = in[i];
    if (c == 'n') {
      return literal("null", [&] { out.kind = Json::Kind::Null; });
    }
    if (c == 't') {
      return literal("true", [&] {
        out.kind = Json::Kind::Bool;
        out.boolean = true;
      });
    }
    if (c == 'f') {
      return literal("false", [&] {
        out.kind = Json::Kind::Bool;
        out.boolean = false;
      });
    }
    if (c == '"') {
      return parse_string(out);
    }
    if (c == '-' || (c >= '0' && c <= '9')) {
      return parse_number(out);
    }
    if (c == '[') {
      return parse_array(out);
    }
    if (c == '{') {
      return parse_object(out);
    }
    return fail("JSON value is invalid.");
  }

  template <typename Fn>
  bool literal(const char* text, Fn&& accept) {
    const size_t length = std::char_traits<char>::length(text);
    if (in.substr(i, length) != text) {
      return fail("JSON literal is invalid.");
    }
    i += length;
    accept();
    return true;
  }

  bool parse_string(Json& out) {
    i += 1;
    std::string value;
    while (i < in.size()) {
      const unsigned char c = static_cast<unsigned char>(in[i]);
      if (c == '"') {
        i += 1;
        out.kind = Json::Kind::String;
        out.text = std::move(value);
        return true;
      }
      if (c == '\\') {
        i += 1;
        if (i >= in.size()) {
          return fail("JSON string escape is incomplete.");
        }
        const char esc = in[i];
        i += 1;
        switch (esc) {
          case '"':
          case '\\':
          case '/':
            value.push_back(esc);
            break;
          case 'b':
            value.push_back('\b');
            break;
          case 'f':
            value.push_back('\f');
            break;
          case 'n':
            value.push_back('\n');
            break;
          case 'r':
            value.push_back('\r');
            break;
          case 't':
            value.push_back('\t');
            break;
          case 'u':
            if (!append_unicode(value)) {
              return false;
            }
            break;
          default:
            return fail("JSON string escape is invalid.");
        }
        continue;
      }
      if (c < 0x20) {
        return fail("JSON string contains a control character.");
      }
      value.push_back(static_cast<char>(c));
      i += 1;
    }
    return fail("JSON string is not closed.");
  }

  bool append_unicode(std::string& value) {
    if (i + 4 > in.size()) {
      return fail("JSON unicode escape is incomplete.");
    }
    int code = 0;
    for (int n = 0; n < 4; n += 1) {
      const char hex = in[i + static_cast<size_t>(n)];
      code <<= 4;
      if (hex >= '0' && hex <= '9') {
        code += hex - '0';
      } else if (hex >= 'a' && hex <= 'f') {
        code += hex - 'a' + 10;
      } else if (hex >= 'A' && hex <= 'F') {
        code += hex - 'A' + 10;
      } else {
        return fail("JSON unicode escape is invalid.");
      }
    }
    i += 4;
    if (code >= 0xD800 && code <= 0xDFFF) {
      return fail("JSON surrogate pairs are not accepted in this core.");
    }
    if (code < 0x80) {
      value.push_back(static_cast<char>(code));
    } else if (code < 0x800) {
      value.push_back(static_cast<char>(0xC0 | (code >> 6)));
      value.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    } else {
      value.push_back(static_cast<char>(0xE0 | (code >> 12)));
      value.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
      value.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    }
    return true;
  }

  bool parse_number(Json& out) {
    const size_t start = i;
    if (in[i] == '-') {
      i += 1;
    }
    if (i >= in.size() || in[i] < '0' || in[i] > '9') {
      return fail("JSON number is invalid.");
    }
    if (in[i] == '0') {
      i += 1;
    } else {
      while (i < in.size() && in[i] >= '0' && in[i] <= '9') {
        i += 1;
      }
    }
    if (i < in.size() && in[i] == '.') {
      i += 1;
      if (i >= in.size() || in[i] < '0' || in[i] > '9') {
        return fail("JSON number is invalid.");
      }
      while (i < in.size() && in[i] >= '0' && in[i] <= '9') {
        i += 1;
      }
    }
    if (i < in.size() && (in[i] == 'e' || in[i] == 'E')) {
      i += 1;
      if (i < in.size() && (in[i] == '+' || in[i] == '-')) {
        i += 1;
      }
      if (i >= in.size() || in[i] < '0' || in[i] > '9') {
        return fail("JSON number is invalid.");
      }
      while (i < in.size() && in[i] >= '0' && in[i] <= '9') {
        i += 1;
      }
    }
    out.kind = Json::Kind::Number;
    out.text = std::string(in.substr(start, i - start));
    return true;
  }

  bool parse_array(Json& out) {
    if (depth >= kMaxDepth) {
      return fail("JSON value is nested too deeply.");
    }
    depth += 1;
    i += 1;
    out.kind = Json::Kind::Array;
    skip();
    if (i < in.size() && in[i] == ']') {
      i += 1;
      depth -= 1;
      return true;
    }
    while (true) {
      Json child;
      if (!parse_value(child)) {
        return false;
      }
      out.array.push_back(std::move(child));
      skip();
      if (i < in.size() && in[i] == ',') {
        i += 1;
        continue;
      }
      if (i < in.size() && in[i] == ']') {
        i += 1;
        depth -= 1;
        return true;
      }
      return fail("JSON array is not closed.");
    }
  }

  bool parse_object(Json& out) {
    if (depth >= kMaxDepth) {
      return fail("JSON value is nested too deeply.");
    }
    depth += 1;
    i += 1;
    out.kind = Json::Kind::Object;
    skip();
    if (i < in.size() && in[i] == '}') {
      i += 1;
      depth -= 1;
      return true;
    }
    while (true) {
      skip();
      Json key;
      if (i >= in.size() || in[i] != '"') {
        return fail("JSON object key must be a string.");
      }
      if (!parse_string(key)) {
        return false;
      }
      for (const auto& existing : out.object) {
        if (existing.first == key.text) {
          return fail("JSON object has a duplicate key.");
        }
      }
      if (!consume(':')) {
        return false;
      }
      Json child;
      if (!parse_value(child)) {
        return false;
      }
      out.object.emplace_back(std::move(key.text), std::move(child));
      skip();
      if (i < in.size() && in[i] == ',') {
        i += 1;
        continue;
      }
      if (i < in.size() && in[i] == '}') {
        i += 1;
        depth -= 1;
        return true;
      }
      return fail("JSON object is not closed.");
    }
  }
};

void append_string(std::string& out, std::string_view text) {
  out.push_back('"');
  for (unsigned char c : text) {
    switch (c) {
      case '"':
        out += "\\\"";
        break;
      case '\\':
        out += "\\\\";
        break;
      case '\b':
        out += "\\b";
        break;
      case '\f':
        out += "\\f";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out.push_back(static_cast<char>(c));
        }
    }
  }
  out.push_back('"');
}

bool sensitive_name(std::string_view key) {
  return key == "input" || key == "output" || key == "messages" || key == "prompt" ||
         key == "toolResult" || key == "content";
}

}  // namespace

bool parse_json(std::string_view input, Json& out, std::string& error) {
  if (input.size() > (1u << 20)) {
    error = "JSON value exceeds 1 MiB.";
    return false;
  }
  Parser parser{input, 0, 0, {}};
  if (!parser.parse_value(out)) {
    error = parser.error;
    return false;
  }
  parser.skip();
  if (parser.i != input.size()) {
    error = "JSON value has trailing data.";
    return false;
  }
  return true;
}

std::string canonical_json(const Json& value) {
  std::string out;
  switch (value.kind) {
    case Json::Kind::Null:
      return "null";
    case Json::Kind::Bool:
      return value.boolean ? "true" : "false";
    case Json::Kind::Number:
      return value.text;
    case Json::Kind::String:
      append_string(out, value.text);
      return out;
    case Json::Kind::Array: {
      out.push_back('[');
      for (size_t index = 0; index < value.array.size(); index += 1) {
        if (index > 0) {
          out.push_back(',');
        }
        out += canonical_json(value.array[index]);
      }
      out.push_back(']');
      return out;
    }
    case Json::Kind::Object: {
      auto fields = value.object;
      std::sort(fields.begin(), fields.end(), [](const auto& left, const auto& right) {
        return left.first < right.first;
      });
      out.push_back('{');
      for (size_t index = 0; index < fields.size(); index += 1) {
        if (index > 0) {
          out.push_back(',');
        }
        append_string(out, fields[index].first);
        out.push_back(':');
        out += canonical_json(fields[index].second);
      }
      out.push_back('}');
      return out;
    }
  }
  return "null";
}

bool json_is_object(const Json& value) { return value.kind == Json::Kind::Object; }

bool top_level_sensitive_key(const Json& value, std::string& key) {
  if (!json_is_object(value)) {
    return false;
  }
  for (const auto& field : value.object) {
    if (sensitive_name(field.first)) {
      key = field.first;
      return true;
    }
  }
  return false;
}

}  // namespace larkx
