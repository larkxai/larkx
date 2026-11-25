import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoNative = join(packageRoot, "../../native");
const vendor = join(packageRoot, "vendor/larkx");

if (!existsSync(join(repoNative, "core/src/agent.cpp"))) {
  if (existsSync(join(vendor, "core/src/agent.cpp"))) {
    process.exit(0);
  }
  console.error("The shared native core is not available to vendor into @larkxai/react-native.");
  process.exit(1);
}

rmSync(vendor, { recursive: true, force: true });
mkdirSync(vendor, { recursive: true });
for (const relative of ["abi", "core/include", "core/src"]) {
  cpSync(join(repoNative, relative), join(vendor, relative), { recursive: true });
}
