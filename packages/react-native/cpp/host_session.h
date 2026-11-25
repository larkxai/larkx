#pragma once

#include <mutex>
#include <string>

struct larkx_runtime;

namespace larkx::host {

struct Status {
  int code = 0;
  std::string name;
  std::string message;

  bool ok() const { return code == 0; }
};

/**
 * One process-local handle to the shared C++ runtime.
 * This class marshals JSON for the platform bridges. It does not decide
 * agent steps, retry, or replay. Those stay in the core.
 */
class Session {
 public:
  Session() = default;
  Session(const Session&) = delete;
  Session& operator=(const Session&) = delete;
  ~Session();

  Status invoke(const std::string& method, const std::string& args_json, std::string& out);
  void close();

 private:
  void close_unlocked();

  std::mutex mu_;
  larkx_runtime* runtime_ = nullptr;
};

}  // namespace larkx::host
