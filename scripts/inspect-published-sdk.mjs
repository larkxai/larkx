#!/usr/bin/env node
/**
 * Install the published npm package outside this workspace and check that an
 * app can resolve it. This does not compile an iOS or Android application,
 * and it does not execute a run on a device.
 *
 * The pin is the launch package. It must match packages/react-native/package.json.
 * Do not point this at an unpublished version.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PUBLISHED_VERSION = "0.4.1";
const root = join(import.meta.dirname, "..");
const compileAndroid = process.argv.includes("--android");

const packageJson = JSON.parse(
  readFileSync(join(root, "packages/react-native/package.json"), "utf8"),
);
if (packageJson.version !== PUBLISHED_VERSION) {
  throw new Error(
    `packages/react-native is ${packageJson.version}. This check installs the published ${PUBLISHED_VERSION} tarball. Publish first, then update the pin.`,
  );
}

const required = [
  "package/LICENSE",
  "package/README.md",
  "package/package.json",
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/dist/cactus.js",
  "package/dist/cactus.d.ts",
  "package/react-native.config.js",
  "package/LarkXNativeCore.podspec",
  "package/android/build.gradle",
  "package/android/CMakeLists.txt",
  "package/android/src/main/AndroidManifest.xml",
  "package/android/src/main/cpp/jni.cpp",
  "package/android/src/main/java/ai/larkx/reactnative/LarkXHttpModule.java",
  "package/android/src/main/java/ai/larkx/reactnative/LarkXNativeCoreModule.java",
  "package/android/src/main/java/ai/larkx/reactnative/LarkXNativePackage.java",
  "package/ios/LarkXHttp.mm",
  "package/ios/LarkXNativeCore.mm",
  "package/cpp/host_session.cpp",
  "package/cpp/host_session.h",
  "package/vendor/larkx/core/src/agent.cpp",
  "package/vendor/larkx/core/src/sqlite_store.cpp",
  "package/vendor/larkx/abi/include/larkx.h",
];

const directory = mkdtempSync(join(tmpdir(), "larkx-published-"));
try {
  execFileSync("npm", ["pack", `@larkxai/react-native@${PUBLISHED_VERSION}`, "--json"], {
    cwd: directory,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const tarball = join(directory, `larkxai-react-native-${PUBLISHED_VERSION}.tgz`);
  execFileSync("tar", ["-xzf", tarball, "-C", directory], { stdio: "inherit" });
  const packedRoot = join(directory, "package");
  const names = listFiles(packedRoot).map((path) => path.slice(directory.length + 1));
  for (const path of required) {
    if (!names.includes(path)) throw new Error(`Published tarball is missing ${path}`);
  }
  for (const path of names) {
    const lower = path.toLowerCase();
    if (
      lower.includes(".env") ||
      lower.endsWith(".pem") ||
      lower.includes("id_rsa") ||
      lower.includes("credentials.json")
    ) {
      throw new Error(`Published tarball contains ${path}`);
    }
  }

  const published = JSON.parse(readFileSync(join(packedRoot, "package.json"), "utf8"));
  if (published.version !== PUBLISHED_VERSION)
    throw new Error(`Tarball version is ${published.version}`);
  if (published.license !== "Apache-2.0")
    throw new Error(`Tarball license is ${published.license}`);
  const serialized = JSON.stringify(published);
  if (serialized.includes("workspace:"))
    throw new Error("Published package.json still references workspace:");
  for (const name of Object.keys(published.dependencies ?? {})) {
    if (name.startsWith("@larkxai/")) throw new Error(`Published dependencies include ${name}`);
  }
  if (published.peerDependenciesMeta?.["cactus-react-native"]?.optional !== true) {
    throw new Error("cactus-react-native must stay an optional peer");
  }
  if (published.peerDependenciesMeta?.["expo-crypto"]?.optional !== true) {
    throw new Error("expo-crypto must stay an optional peer");
  }
  if (!published.peerDependencies?.["expo-file-system"]) {
    throw new Error("expo-file-system is a required peer for sqlite()");
  }

  const entry = readFileSync(join(packedRoot, "dist/index.js"), "utf8");
  if (!entry.includes('body["error"] === "run_rejected"')) {
    throw new Error("Published JavaScript does not isolate run_rejected");
  }
  if (entry.includes("cactus-react-native") || entry.includes("@larkxai/cactus")) {
    throw new Error("The root entry references Cactus");
  }
  const declarations = readFileSync(join(packedRoot, "dist/index.d.ts"), "utf8");
  for (const name of [
    "createRuntime",
    "defineTool",
    "scriptedModel",
    "sqlite",
    "larkxCloud",
    "remoteAgent",
  ]) {
    if (!declarations.includes(name)) throw new Error(`Published declarations are missing ${name}`);
  }
  if (!readFileSync(join(packedRoot, "dist/cactus.d.ts"), "utf8").includes("cactusModel")) {
    throw new Error("Published cactus declarations are missing cactusModel");
  }
  const http = readFileSync(
    join(packedRoot, "android/src/main/java/ai/larkx/reactnative/LarkXHttpModule.java"),
    "utf8",
  );
  if (!http.includes("setInstanceFollowRedirects(false)")) {
    throw new Error("Published Android HTTP module does not reject redirects");
  }
  if (!http.includes("CookieHandler")) {
    throw new Error("Published Android HTTP module no longer documents CookieHandler");
  }
  const ios = readFileSync(join(packedRoot, "ios/LarkXHttp.mm"), "utf8");
  if (!ios.includes("HTTPShouldSetCookies = NO") || !ios.includes("HTTPCookieAcceptPolicyNever")) {
    throw new Error("Published iOS HTTP module does not disable cookies");
  }
  if (!readFileSync(join(packedRoot, "LICENSE"), "utf8").includes("Apache License")) {
    throw new Error("Published LICENSE is not Apache 2.0");
  }

  const fixture = join(directory, "fixture");
  execFileSync("mkdir", [fixture]);
  writeFileSync(
    join(fixture, "package.json"),
    `${JSON.stringify(
      {
        name: "larkx-published-install-fixture",
        private: true,
        type: "module",
        dependencies: { "@larkxai/react-native": `file:${tarball}` },
        devDependencies: { typescript: "5.9.3" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(fixture, "check.ts"),
    `import { createRuntime, defineTool, larkxCloud, remoteAgent, scriptedModel, sqlite } from "@larkxai/react-native";
import { cactusModel } from "@larkxai/react-native/cactus";

void createRuntime;
void defineTool;
void larkxCloud;
void remoteAgent;
void scriptedModel;
void sqlite;
void cactusModel;
`,
  );
  writeFileSync(
    join(fixture, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          module: "nodenext",
          moduleResolution: "nodenext",
          noEmit: true,
          skipLibCheck: true,
        },
        files: ["check.ts"],
      },
      null,
      2,
    )}\n`,
  );
  execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: fixture, stdio: "inherit" });
  const installed = join(fixture, "node_modules", "@larkxai", "react-native");
  const installedPackage = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  if (installedPackage.version !== PUBLISHED_VERSION) {
    throw new Error(`Installed version is ${installedPackage.version}`);
  }
  if (installed.startsWith(root))
    throw new Error("The fixture resolved inside the LarkX workspace");
  if (!existsSync(join(installed, "vendor/larkx/core/src/agent.cpp"))) {
    throw new Error("postinstall did not leave the vendored core in place");
  }
  if (!existsSync(join(fixture, "node_modules", "expo-file-system"))) {
    throw new Error("The required expo-file-system peer was not installed");
  }
  if (existsSync(join(fixture, "node_modules", "cactus-react-native"))) {
    console.log(
      "npm also installed the optional cactus-react-native peer. The SDK does not depend on it.",
    );
  } else {
    console.log(
      "The optional cactus-react-native peer was not installed. The root package does not require it.",
    );
  }
  execFileSync(join(fixture, "node_modules", "typescript", "bin", "tsc"), ["-p", "tsconfig.json"], {
    cwd: fixture,
    stdio: "inherit",
  });

  if (compileAndroid) {
    const ndk = process.env.ANDROID_NDK;
    if (!ndk) throw new Error("ANDROID_NDK is required for --android");
    const build = join(directory, "android-build");
    execFileSync(
      "cmake",
      [
        "-S",
        join(packedRoot, "android"),
        "-B",
        build,
        `-DCMAKE_TOOLCHAIN_FILE=${join(ndk, "build/cmake/android.toolchain.cmake")}`,
        "-DANDROID_ABI=arm64-v8a",
        "-DANDROID_PLATFORM=android-24",
        "-DANDROID_STL=c++_shared",
        "-DCMAKE_BUILD_TYPE=Release",
      ],
      { stdio: "inherit" },
    );
    execFileSync("cmake", ["--build", build], { stdio: "inherit" });
    console.log(
      "Compiled the published Android native library. This is not an application build and not a device run.",
    );
  }

  console.log(
    `Published @larkxai/react-native@${PUBLISHED_VERSION} unpacked, installed outside the workspace, and typechecked. ${names.length} tarball entries.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}
