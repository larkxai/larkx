#define NAPI_VERSION 8

#include "host_session.h"

#include <node_api.h>

#include <memory>
#include <string>

namespace {

std::string napi_text(napi_env env, napi_value value) {
  size_t length = 0;
  napi_get_value_string_utf8(env, value, nullptr, 0, &length);
  std::string text(length, '\0');
  size_t written = 0;
  napi_get_value_string_utf8(env, value, text.data(), length + 1, &written);
  text.resize(written);
  return text;
}

void throw_status(napi_env env, const larkx::host::Status& status) {
  napi_value code = nullptr;
  napi_value message = nullptr;
  napi_value error = nullptr;
  napi_create_string_utf8(env, status.name.c_str(), status.name.size(), &code);
  napi_create_string_utf8(env, status.message.c_str(), status.message.size(), &message);
  napi_create_error(env, code, message, &error);
  napi_throw(env, error);
}

napi_value Invoke(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {nullptr, nullptr};
  void* data = nullptr;
  napi_get_cb_info(env, info, &argc, argv, nullptr, &data);
  auto* session = static_cast<larkx::host::Session*>(data);
  if (session == nullptr || argc < 2) {
    larkx::host::Status status;
    status.code = 1;
    status.name = "INVALID_ARGUMENT";
    status.message = "Host invoke is missing a method or arguments.";
    throw_status(env, status);
    return nullptr;
  }
  const std::string method = napi_text(env, argv[0]);
  const std::string args = napi_text(env, argv[1]);
  std::string out;
  const larkx::host::Status status = session->invoke(method, args, out);
  if (!status.ok()) {
    throw_status(env, status);
    return nullptr;
  }
  napi_value result = nullptr;
  napi_create_string_utf8(env, out.c_str(), out.size(), &result);
  return result;
}

void Finalize(napi_env /*env*/, void* data, void* /*hint*/) {
  auto* session = static_cast<larkx::host::Session*>(data);
  delete session;
}

napi_value CreateSession(napi_env env, napi_callback_info /*info*/) {
  auto session = std::make_unique<larkx::host::Session>();
  napi_value object = nullptr;
  napi_create_object(env, &object);
  napi_value invoke = nullptr;
  napi_create_function(env, "invoke", NAPI_AUTO_LENGTH, Invoke, session.get(), &invoke);
  napi_set_named_property(env, object, "invoke", invoke);
  napi_add_finalizer(env, object, session.get(), Finalize, nullptr, nullptr);
  session.release();
  return object;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_value create = nullptr;
  napi_create_function(env, "createSession", NAPI_AUTO_LENGTH, CreateSession, nullptr, &create);
  napi_set_named_property(env, exports, "createSession", create);
  return exports;
}

}  // namespace

NAPI_MODULE(larkx_native, Init)
