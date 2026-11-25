module.exports = {
  dependency: {
    platforms: {
      // Classic native module. The library Gradle project builds liblarkxnative.so.
      // libraryName stays unset so the app's codegen CMake build does not compile a second copy.
      android: {
        sourceDir: "./android",
        packageImportPath: "import ai.larkx.reactnative.LarkXNativePackage;",
        packageInstance: "new LarkXNativePackage()",
      },
    },
  },
};
