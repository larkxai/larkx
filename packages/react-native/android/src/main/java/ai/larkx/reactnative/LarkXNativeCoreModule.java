package ai.larkx.reactnative;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class LarkXNativeCoreModule extends ReactContextBaseJavaModule {
  static {
    System.loadLibrary("larkxnative");
  }

  private long handle;

  public LarkXNativeCoreModule(ReactApplicationContext context) {
    super(context);
    handle = nativeCreate();
  }

  @Override
  public String getName() {
    return "LarkXNativeCore";
  }

  @ReactMethod
  public void invoke(String method, String argsJson, Promise promise) {
    if (handle == 0) {
      promise.reject("INVALID_ARGUMENT", "The native runtime was destroyed.");
      return;
    }
    try {
      promise.resolve(nativeInvoke(handle, method, argsJson));
    } catch (IllegalStateException error) {
      String message = error.getMessage() == null ? "NATIVE" : error.getMessage();
      int split = message.indexOf(": ");
      String code = split < 0 ? "NATIVE" : message.substring(0, split);
      String detail = split < 0 ? message : message.substring(split + 2);
      promise.reject(code, detail);
    }
  }

  @Override
  public void invalidate() {
    if (handle != 0) {
      nativeDestroy(handle);
      handle = 0;
    }
    super.invalidate();
  }

  private native long nativeCreate();

  private native void nativeDestroy(long handle);

  private native String nativeInvoke(long handle, String method, String argsJson);
}
