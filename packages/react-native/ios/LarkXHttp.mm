#import <React/RCTBridgeModule.h>

@interface LarkXHttp : NSObject <RCTBridgeModule, NSURLSessionDataDelegate, NSURLSessionTaskDelegate>
@end

@implementation LarkXHttp {
  NSURLSession *_session;
  dispatch_queue_t _queue;
  NSMutableDictionary<NSNumber *, NSMutableDictionary *> *_requests;
  NSMutableDictionary<NSNumber *, NSNumber *> *_taskRequests;
  NSMutableSet<NSNumber *> *_cancelled;
}

RCT_EXPORT_MODULE(LarkXHttp);

- (instancetype)init {
  if ((self = [super init])) {
    NSURLSessionConfiguration *configuration = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    configuration.HTTPShouldSetCookies = NO;
    configuration.HTTPCookieAcceptPolicy = NSHTTPCookieAcceptPolicyNever;
    configuration.HTTPCookieStorage = nil;
    configuration.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
    configuration.URLCache = nil;
    _queue = dispatch_queue_create("ai.larkx.http", DISPATCH_QUEUE_SERIAL);
    _session = [NSURLSession sessionWithConfiguration:configuration delegate:self delegateQueue:nil];
    _requests = [NSMutableDictionary dictionary];
    _taskRequests = [NSMutableDictionary dictionary];
    _cancelled = [NSMutableSet set];
  }
  return self;
}

- (void)invalidate {
  dispatch_sync(_queue, ^{
    for (NSNumber *requestId in [_requests allKeys]) {
      [self finishLocked:requestId payload:@{@"ok" : @NO, @"error" : @"cancelled"}];
    }
  });
  [_session invalidateAndCancel];
}

RCT_EXPORT_METHOD(request : (nonnull NSNumber *)requestId payload : (NSString *)payload resolver : (
    RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
  (void)reject;
  NSData *encoded = [payload dataUsingEncoding:NSUTF8StringEncoding];
  id parsed = encoded == nil ? nil : [NSJSONSerialization JSONObjectWithData:encoded options:0 error:nil];
  __block BOOL alreadyCancelled = NO;
  dispatch_sync(_queue, ^{
    alreadyCancelled = [_cancelled containsObject:requestId];
  });
  if (alreadyCancelled || ![parsed isKindOfClass:[NSDictionary class]]) {
    resolve([self encode:@{@"ok" : @NO, @"error" : alreadyCancelled ? @"cancelled" : @"invalid_url"}]);
    return;
  }
  NSDictionary *document = (NSDictionary *)parsed;
  NSString *urlText = [document[@"url"] isKindOfClass:[NSString class]] ? document[@"url"] : @"";
  NSString *method = [document[@"method"] isKindOfClass:[NSString class]] ? document[@"method"] : @"GET";
  NSURL *url = [NSURL URLWithString:urlText];
  NSString *scheme = url.scheme.lowercaseString;
  if (url == nil || url.host.length == 0 || url.user.length > 0 || url.password.length > 0 ||
      !([scheme isEqualToString:@"https"] || [scheme isEqualToString:@"http"])) {
    resolve([self encode:@{@"ok" : @NO, @"error" : @"invalid_url"}]);
    return;
  }
  if (!([method isEqualToString:@"GET"] || [method isEqualToString:@"POST"])) {
    resolve([self encode:@{@"ok" : @NO, @"error" : @"invalid_url"}]);
    return;
  }
  NSTimeInterval timeout = 10;
  if ([document[@"timeoutMs"] isKindOfClass:[NSNumber class]]) {
    timeout = MAX(0.001, [document[@"timeoutMs"] doubleValue] / 1000.0);
  }
  NSUInteger maxBytes = 65536;
  if ([document[@"maxBytes"] isKindOfClass:[NSNumber class]]) {
    maxBytes = (NSUInteger)MAX(1, [document[@"maxBytes"] integerValue]);
  }
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = method;
  request.timeoutInterval = timeout;
  request.HTTPShouldHandleCookies = NO;
  request.cachePolicy = NSURLRequestReloadIgnoringLocalCacheData;
  NSDictionary *headers = [document[@"headers"] isKindOfClass:[NSDictionary class]] ? document[@"headers"] : @{};
  for (id key in headers) {
    id value = headers[key];
    if (![key isKindOfClass:[NSString class]] || ![value isKindOfClass:[NSString class]]) {
      continue;
    }
    if ([key rangeOfCharacterFromSet:[NSCharacterSet newlineCharacterSet]].location != NSNotFound ||
        [value rangeOfCharacterFromSet:[NSCharacterSet newlineCharacterSet]].location != NSNotFound) {
      continue;
    }
    [request setValue:value forHTTPHeaderField:key];
  }
  if ([document[@"body"] isKindOfClass:[NSString class]] && [method isEqualToString:@"POST"]) {
    request.HTTPBody = [(NSString *)document[@"body"] dataUsingEncoding:NSUTF8StringEncoding];
  }
  dispatch_sync(_queue, ^{
    _requests[requestId] = [@{
      @"resolve" : resolve,
      @"settled" : @NO,
      @"data" : [NSMutableData data],
      @"maxBytes" : @(maxBytes),
    } mutableCopy];
  });
  NSURLSessionDataTask *task = [_session dataTaskWithRequest:request];
  dispatch_sync(_queue, ^{
    NSMutableDictionary *state = _requests[requestId];
    if (state == nil || [state[@"settled"] boolValue]) {
      [task cancel];
      return;
    }
    state[@"task"] = task;
    _taskRequests[@(task.taskIdentifier)] = requestId;
  });
  [task resume];
}

RCT_EXPORT_METHOD(cancel : (nonnull NSNumber *)requestId) {
  __block NSURLSessionTask *task = nil;
  dispatch_sync(_queue, ^{
    NSMutableDictionary *state = _requests[requestId];
    if (state == nil) {
      [_cancelled addObject:requestId];
      return;
    }
    task = state[@"task"];
    [self finishLocked:requestId payload:@{@"ok" : @NO, @"error" : @"cancelled"}];
  });
  [task cancel];
}

- (void)URLSession:(NSURLSession *)session
                          task:(NSURLSessionTask *)task
    willPerformHTTPRedirection:(NSHTTPURLResponse *)response
                    newRequest:(NSURLRequest *)request
             completionHandler:(void (^)(NSURLRequest *_Nullable))completionHandler {
  (void)request;
  __block NSNumber *requestId = nil;
  dispatch_sync(_queue, ^{
    requestId = _taskRequests[@(task.taskIdentifier)];
    NSMutableDictionary *state = requestId == nil ? nil : _requests[requestId];
    if (state != nil) {
      state[@"redirectStatus"] = @(response.statusCode);
    }
  });
  completionHandler(nil);
  if (requestId == nil) {
    return;
  }
  dispatch_async(_queue, ^{
    NSMutableDictionary *state = _requests[requestId];
    if (state == nil || [state[@"settled"] boolValue] || state[@"redirectStatus"] == nil) {
      return;
    }
    [self finishLocked:requestId
               payload:@{@"ok" : @NO, @"error" : @"redirect", @"status" : state[@"redirectStatus"]}];
  });
}

- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveData:(NSData *)data {
  dispatch_async(_queue, ^{
    NSNumber *requestId = _taskRequests[@(task.taskIdentifier)];
    NSMutableDictionary *state = requestId == nil ? nil : _requests[requestId];
    if (state == nil || [state[@"settled"] boolValue]) {
      return;
    }
    NSMutableData *body = state[@"data"];
    if (body.length + data.length > [state[@"maxBytes"] unsignedIntegerValue]) {
      [self finishLocked:requestId payload:@{@"ok" : @NO, @"error" : @"oversized"}];
      [task cancel];
      return;
    }
    [body appendData:data];
  });
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  dispatch_async(_queue, ^{
    NSNumber *requestId = _taskRequests[@(task.taskIdentifier)];
    if (requestId == nil) {
      return;
    }
    NSMutableDictionary *state = _requests[requestId];
    if (state == nil || [state[@"settled"] boolValue]) {
      return;
    }
    if (state[@"redirectStatus"] != nil) {
      [self finishLocked:requestId
                 payload:@{@"ok" : @NO, @"error" : @"redirect", @"status" : state[@"redirectStatus"]}];
      return;
    }
    if (error != nil) {
      NSString *kind = error.code == NSURLErrorTimedOut ? @"timeout" : @"network";
      if (error.code == NSURLErrorCancelled) {
        kind = @"cancelled";
      }
      [self finishLocked:requestId payload:@{@"ok" : @NO, @"error" : kind}];
      return;
    }
    NSHTTPURLResponse *response = [task.response isKindOfClass:[NSHTTPURLResponse class]]
                                      ? (NSHTTPURLResponse *)task.response
                                      : nil;
    NSInteger status = response.statusCode;
    if (status >= 300 && status < 400) {
      [self finishLocked:requestId payload:@{@"ok" : @NO, @"error" : @"redirect", @"status" : @(status)}];
      return;
    }
    NSMutableDictionary *headers = [NSMutableDictionary dictionary];
    [response.allHeaderFields enumerateKeysAndObjectsUsingBlock:^(id key, id value, BOOL *stop) {
      if ([key isKindOfClass:[NSString class]] && [value isKindOfClass:[NSString class]]) {
        headers[[(NSString *)key lowercaseString]] = value;
      }
    }];
    NSString *body = [[NSString alloc] initWithData:state[@"data"] encoding:NSUTF8StringEncoding] ?: @"";
    [self finishLocked:requestId
               payload:@{@"ok" : @YES, @"status" : @(status), @"headers" : headers, @"body" : body}];
  });
}

- (void)finishLocked:(NSNumber *)requestId payload:(NSDictionary *)payload {
  NSMutableDictionary *state = _requests[requestId];
  if (state == nil || [state[@"settled"] boolValue]) {
    return;
  }
  state[@"settled"] = @YES;
  RCTPromiseResolveBlock resolve = state[@"resolve"];
  NSString *encoded = [self encode:payload];
  [_requests removeObjectForKey:requestId];
  NSNumber *taskId = nil;
  for (NSNumber *candidate in _taskRequests) {
    if ([_taskRequests[candidate] isEqualToNumber:requestId]) {
      taskId = candidate;
      break;
    }
  }
  if (taskId != nil) {
    [_taskRequests removeObjectForKey:taskId];
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(encoded);
  });
}

- (NSString *)encode:(NSDictionary *)payload {
  NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
  if (data == nil) {
    return @"{\"ok\":false,\"error\":\"network\"}";
  }
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"{\"ok\":false,\"error\":\"network\"}";
}

@end
