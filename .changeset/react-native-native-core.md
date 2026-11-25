---
"@larkxai/react-native": patch
---

Add a preview React Native host for the shared C++ core at `@larkxai/react-native/native`. The default export remains the TypeScript engine. One host driver serves a run id, Android session destruction waits for in-flight calls, and JNI uses standard UTF-8.
