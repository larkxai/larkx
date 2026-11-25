// Stub used only by packages/react-native/ios/ci-compile.sh.
// The development build includes React-Core instead of this header.

#import <Foundation/Foundation.h>

#define RCT_EXPORT_MODULE(name) \
  +(NSString *)moduleName {     \
    return @#name;              \
  }

#define RCT_EXPORT_METHOD(method) -(void)method

typedef void (^RCTPromiseResolveBlock)(id result);
typedef void (^RCTPromiseRejectBlock)(NSString *code, NSString *message, NSError *error);

@protocol RCTBridgeModule
@end
