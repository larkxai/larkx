# Obsolete npm packages

These packages were published from this repository. They are not part of the SDK anymore. Existing versions on npm stay published. This repository does not unpublish them and does not publish new versions.

| Package                   | Last role                                                     |
| ------------------------- | ------------------------------------------------------------- |
| `@larkxai/core`           | TypeScript workflow engine, reducer, and replay               |
| `@larkxai/agent`          | TypeScript agent loop on that engine                          |
| `@larkxai/storage-memory` | In-memory adapter for the TypeScript reducer                  |
| `@larkxai/storage-sqlite` | SQLite adapter for the TypeScript reducer                     |
| `@larkxai/testing`        | Fake clocks and storage conformance for the TypeScript engine |

`@larkxai/node` and `@larkxai/react-native` keep their names. Their APIs changed. `createNodeEngine`, `defineWorkflow`, the Expo SQLite execution adapter, and the `@larkxai/react-native/native` entry point are gone. Install the current packages and import `createRuntime` from `@larkxai/node` or `@larkxai/react-native`.

Open a new SQLite file for the C++ runtime. Pointing it at a TypeScript-engine database is unsupported. The runtime does not delete that file and does not migrate it.
