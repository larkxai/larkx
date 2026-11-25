#pragma once

#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace larkx {

struct Json {
  enum class Kind { Null, Bool, Number, String, Array, Object };

  Kind kind = Kind::Null;
  bool boolean = false;
  std::string text;
  std::vector<Json> array;
  std::vector<std::pair<std::string, Json>> object;
};

bool parse_json(std::string_view input, Json& out, std::string& error);
std::string canonical_json(const Json& value);
bool json_is_object(const Json& value);
bool top_level_sensitive_key(const Json& value, std::string& key);

}  // namespace larkx
