#include <jni.h>

#include "host_session.h"

#include <string>

namespace {

larkx::host::Session* session_from(jlong handle) {
  return reinterpret_cast<larkx::host::Session*>(handle);
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_ai_larkx_reactnative_LarkXNativeCoreModule_nativeCreate(JNIEnv* /*env*/, jobject /*thiz*/) {
  return reinterpret_cast<jlong>(new larkx::host::Session());
}

extern "C" JNIEXPORT void JNICALL Java_ai_larkx_reactnative_LarkXNativeCoreModule_nativeDestroy(JNIEnv* /*env*/,
                                                                                               jobject /*thiz*/, jlong handle) {
  delete session_from(handle);
}

extern "C" JNIEXPORT jstring JNICALL Java_ai_larkx_reactnative_LarkXNativeCoreModule_nativeInvoke(
    JNIEnv* env, jobject /*thiz*/, jlong handle, jstring method, jstring args_json) {
  const char* method_chars = method == nullptr ? "" : env->GetStringUTFChars(method, nullptr);
  const char* args_chars = args_json == nullptr ? "{}" : env->GetStringUTFChars(args_json, nullptr);
  std::string out;
  const larkx::host::Status status = session_from(handle)->invoke(method_chars, args_chars, out);
  if (method != nullptr) {
    env->ReleaseStringUTFChars(method, method_chars);
  }
  if (args_json != nullptr) {
    env->ReleaseStringUTFChars(args_json, args_chars);
  }
  if (!status.ok()) {
    const std::string text = status.name + ": " + status.message;
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), text.c_str());
    return nullptr;
  }
  return env->NewStringUTF(out.c_str());
}
