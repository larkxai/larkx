#import <React/RCTBridgeModule.h>

#include "host_session.h"

#include <string>

@interface LarkXNativeCore : NSObject <RCTBridgeModule>
@end

@implementation LarkXNativeCore {
  larkx::host::Session session_;
}

RCT_EXPORT_MODULE(LarkXNativeCore);

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(invoke:(NSString *)method
                  argsJson:(NSString *)argsJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  std::string out;
  const larkx::host::Status status =
      session_.invoke(method == nil ? "" : method.UTF8String, argsJson == nil ? "{}" : argsJson.UTF8String, out);
  if (!status.ok()) {
    reject([NSString stringWithUTF8String:status.name.c_str()],
           [NSString stringWithUTF8String:status.message.c_str()], nil);
    return;
  }
  resolve([NSString stringWithUTF8String:out.c_str()]);
}

- (void)invalidate {
  session_.close();
}

@end
