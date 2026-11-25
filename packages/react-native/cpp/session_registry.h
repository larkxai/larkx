#pragma once

#include "host_session.h"

#include <cstdint>
#include <functional>

namespace larkx::host {

// Integer handles for the Android module.
// destroy waits until other threads leave invoke, then deletes the session.
// A destroy on a thread already inside invoke for that same session waits
// for every other thread and then returns. That invoke releases the session
// when it returns. Destroy of one session still waits while the caller is
// inside invoke for a different session.
class SessionRegistry {
 public:
  using Id = std::uint64_t;

  SessionRegistry();
  ~SessionRegistry();
  SessionRegistry(const SessionRegistry&) = delete;
  SessionRegistry& operator=(const SessionRegistry&) = delete;

  Id create();
  bool invoke(Id id, const std::function<void(Session&)>& body);
  void destroy(Id id);

  // Runs under the session lock, immediately before destroy waits.
  // The hook must not call back into the registry. Host tests use it to
  // release a thread that is still inside invoke.
  void set_before_wait_for_tests(std::function<void()> hook);

 private:
  struct State;
  State* state_;
  std::function<void()> before_wait_;
};

}  // namespace larkx::host
