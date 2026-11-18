/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this file as CommonJS. */
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// pnpm keeps Expo's own dependencies beside the package inside .pnpm.
// Hierarchical lookup is what finds those, including @ungap/structured-clone.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
