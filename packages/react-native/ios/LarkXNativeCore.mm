#import <React/RCTBridgeModule.h>

#include "host_session.h"
#include "utf.h"

#include <string>

@interface LarkXNativeCore : NSObject <RCTBridgeModule>
@end

static std::string ns_to_utf8(NSString* value, const char* fallback) {
  if (value == nil) {
    return fallback;
  }
  // UTF-16 keeps embedded NUL and lone surrogates. The shared codec maps lone
  // surrogates to U+FFFD and encodes NUL as one UTF-8 byte.
  NSData* data = [value dataUsingEncoding:NSUTF16LittleEndianStringEncoding];
  if (data == nil || data.length % sizeof(char16_t) != 0) {
    return fallback;
  }
  return larkx::host::utf16_to_utf8(static_cast<const char16_t*>(data.bytes), data.length / sizeof(char16_t));
}

static NSString* utf8_to_ns(const std::string& text) {
  const std::u16string utf16 = larkx::host::utf8_to_utf16(text);
  if (utf16.empty()) {
    return @"";
  }
  NSString* value = [[NSString alloc] initWithBytes:utf16.data()
                                             length:utf16.size() * sizeof(char16_t)
                                           encoding:NSUTF16LittleEndianStringEncoding];
  return value == nil ? @"" : value;
}

@implementation LarkXNativeCore {
  larkx::host::Session session_;
}

RCT_EXPORT_MODULE(LarkXNativeCore);

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(invoke:(NSString*)method
                  argsJson:(NSString*)argsJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  std::string out;
  const larkx::host::Status status = session_.invoke(ns_to_utf8(method, ""), ns_to_utf8(argsJson, "{}"), out);
  if (!status.ok()) {
    reject(utf8_to_ns(status.name), utf8_to_ns(status.message), nil);
    return;
  }
  resolve(utf8_to_ns(out));
}

- (void)invalidate {
  session_.close();
}

@end
