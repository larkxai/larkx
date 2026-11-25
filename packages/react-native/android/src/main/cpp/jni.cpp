#include <jni.h>

#include "session_registry.h"
#include "utf.h"

#include <string>

namespace {

larkx::host::SessionRegistry registry;

std::string java_to_utf8(JNIEnv* env, jstring value, const char* fallback) {
  if (value == nullptr) {
    return fallback;
  }
  const jsize length = env->GetStringLength(value);
  const jchar* chars = env->GetStringChars(value, nullptr);
  if (chars == nullptr) {
    return {};
  }
  static_assert(sizeof(jchar) == sizeof(char16_t), "JNI jchar must match UTF-16 code units");
  std::string utf8 = larkx::host::utf16_to_utf8(reinterpret_cast<const char16_t*>(chars), static_cast<size_t>(length));
  env->ReleaseStringChars(value, chars);
  return utf8;
}

jstring utf8_to_java(JNIEnv* env, const std::string& utf8) {
  const std::u16string utf16 = larkx::host::utf8_to_utf16(utf8);
  if (utf16.empty()) {
    return env->NewString(nullptr, 0);
  }
  return env->NewString(reinterpret_cast<const jchar*>(utf16.data()), static_cast<jsize>(utf16.size()));
}

void throw_state(JNIEnv* env, const std::string& text) {
  jclass type = env->FindClass("java/lang/IllegalStateException");
  if (type == nullptr) {
    return;
  }
  jmethodID ctor = env->GetMethodID(type, "<init>", "(Ljava/lang/String;)V");
  if (ctor == nullptr) {
    env->DeleteLocalRef(type);
    return;
  }
  jstring message = utf8_to_java(env, text);
  if (message == nullptr) {
    env->DeleteLocalRef(type);
    return;
  }
  jobject error = env->NewObject(type, ctor, message);
  if (error != nullptr) {
    env->Throw(static_cast<jthrowable>(error));
  }
  env->DeleteLocalRef(message);
  env->DeleteLocalRef(type);
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_ai_larkx_reactnative_LarkXNativeCoreModule_nativeCreate(JNIEnv* /*env*/, jobject /*thiz*/) {
  return static_cast<jlong>(registry.create());
}

extern "C" JNIEXPORT void JNICALL Java_ai_larkx_reactnative_LarkXNativeCoreModule_nativeDestroy(JNIEnv* /*env*/,
                                                                                               jobject /*thiz*/, jlong handle) {
  if (handle > 0) {
    registry.destroy(static_cast<larkx::host::SessionRegistry::Id>(handle));
  }
}

extern "C" JNIEXPORT jstring JNICALL Java_ai_larkx_reactnative_LarkXNativeCoreModule_nativeInvoke(
    JNIEnv* env, jobject /*thiz*/, jlong handle, jstring method, jstring args_json) {
  if (handle <= 0) {
    throw_state(env, "INVALID_ARGUMENT: The native runtime was destroyed.");
    return nullptr;
  }
  const std::string method_text = java_to_utf8(env, method, "");
  if (env->ExceptionCheck()) {
    return nullptr;
  }
  const std::string args_text = java_to_utf8(env, args_json, "{}");
  if (env->ExceptionCheck()) {
    return nullptr;
  }
  std::string out;
  larkx::host::Status status;
  const bool ran = registry.invoke(static_cast<larkx::host::SessionRegistry::Id>(handle),
                                   [&](larkx::host::Session& session) { status = session.invoke(method_text, args_text, out); });
  if (!ran) {
    throw_state(env, "INVALID_ARGUMENT: The native runtime was destroyed.");
    return nullptr;
  }
  if (!status.ok()) {
    throw_state(env, status.name + ": " + status.message);
    return nullptr;
  }
  return utf8_to_java(env, out);
}
