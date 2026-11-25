import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageRoot, "../..");
const vendorCore = join(packageRoot, "native/vendor/larkx");
const vendorHost = join(packageRoot, "native/vendor/host");
const repoCore = join(repoRoot, "native");
const repoHost = join(repoRoot, "packages/react-native/cpp");

if (!existsSync(join(repoCore, "core/src/agent.cpp"))) {
  if (existsSync(join(vendorCore, "core/src/agent.cpp"))) {
    process.exit(0);
  }
  console.error("The shared native core is not available to vendor into @larkxai/node.");
  process.exit(1);
}

rmSync(join(packageRoot, "native/vendor"), { recursive: true, force: true });
mkdirSync(vendorCore, { recursive: true });
mkdirSync(vendorHost, { recursive: true });
for (const relative of ["CMakeLists.txt", "abi", "core", "conformance"]) {
  cpSync(join(repoCore, relative), join(vendorCore, relative), { recursive: true });
}
for (const name of [
  "node_binding.cpp",
  "host_session.cpp",
  "host_session.h",
  "session_registry.cpp",
  "session_registry.h",
  "utf.cpp",
  "utf.h",
]) {
  cpSync(join(repoHost, name), join(vendorHost, name));
}
