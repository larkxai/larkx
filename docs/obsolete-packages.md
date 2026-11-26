# Obsolete npm packages

These packages were published from this repository. They are not part of the SDK anymore. Existing versions on npm stay published. This repository does not unpublish them and does not publish new versions.

| Package                   | Last role                                                     |
| ------------------------- | ------------------------------------------------------------- |
| `@larkxai/core`           | TypeScript workflow engine, reducer, and replay               |
| `@larkxai/agent`          | TypeScript agent loop on that engine                          |
| `@larkxai/storage-memory` | In-memory adapter for the TypeScript reducer                  |
| `@larkxai/storage-sqlite` | SQLite adapter for the TypeScript reducer                     |
| `@larkxai/testing`        | Fake clocks and storage conformance for the TypeScript engine |

These modules remain in the repository as private workspace packages. Application code does not install them. Existing npm versions stay published. New versions are not published.

| Package              | Where it lives now                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `@larkxai/host`      | Private driver, bundled into the React Native SDK                                                      |
| `@larkxai/protocol`  | Private contracts, bundled into the React Native SDK                                                   |
| `@larkxai/node`      | Private Node host for tests. Previously published versions stay on npm. New versions are not published |
| `@larkxai/cactus`    | Private adapter, imported as `@larkxai/react-native/cactus`                                            |
| `@larkxai/telemetry` | Private metadata client. The C++ runtime does not call it                                              |

`@larkxai/react-native` is the public SDK. `@larkxai/node` keeps its name inside this repository and is no longer published. `createNodeEngine`, `defineWorkflow`, the Expo SQLite execution adapter, and the `@larkxai/react-native/native` entry point are gone. Install `@larkxai/react-native` and import `createRuntime` from it.

Open a new SQLite file for the C++ runtime. Databases created by this runtime carry SQLite `application_id` `0x4C585254`. A TypeScript-engine file or an earlier native preview file does not, so it is rejected and left in place. The runtime does not delete it and does not migrate it.
