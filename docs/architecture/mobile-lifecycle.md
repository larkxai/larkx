# Mobile lifecycle

`@larkx/react-native` is the Expo adapter for the existing engine. It does not contain a second workflow runner or a second durability log. Workflow functions, replay, effect classes, and the SQLite schema are the ones from `@larkx/core` and `@larkx/storage-sqlite`.

## SQLite driver

The driver is `expo-sqlite` 58, through `openDatabaseSync`, `execSync`, `runSync`, `getFirstSync`, `getAllSync`, and `closeSync`.

That module was chosen because `SqliteDriver` is synchronous. The Expo sync API can run `BEGIN IMMEDIATE`, the statement, and `COMMIT` or `ROLLBACK` before the call returns. The shared `migrate()` function creates schema version 1. There is no React Native-specific schema.

OP-SQLite (`@op-engineering/op-sqlite` 19) was rejected for this milestone. Its transactions are asynchronous, and its documentation says `executeSync` is not available inside a transaction. Using it would require a second storage implementation. It also does not run in Expo Go.

`withTransactionSync` was not used. It starts a deferred `BEGIN` and does not return the callback's value. The driver issues `BEGIN IMMEDIATE` itself, matching the Node driver.

Sync calls block the JavaScript thread. LarkX transactions are short status updates. That is acceptable here. It is not a claim about large scans.

## Ownership

Node can treat a dead pid as proof that the previous executor stopped, and it can take an expired lease. A phone cannot. A suspended JavaScript runtime is still the same runtime: timers do not fire, so the lease expires, but the in-flight handler and its fence are still alive.

Mobile storage sets `exclusiveOwnership`. Another owner can take a run only when `mayStealFrom` returns true. The adapter returns true only when that owner id is absent from the live-owner set on `globalThis`.

| Situation                              | What happens                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App is suspended and the lease expires | The same owner refreshes the lease and keeps its epoch. The in-flight commit still matches the fence. A second engine in the same realm cannot take the run                                             |
| Foreground                             | `bindReactNativeLifecycle` calls `recover()`. A run this engine already owns is not started again                                                                                                       |
| Force-quit or full reload              | The JavaScript realm is gone, so the live-owner set is empty. The new engine may take the run immediately, even if the stored lease has not expired. The epoch increases, so a stale commit cannot land |
| Several `recover()` calls              | The in-process lock and the storage claim allow one executor                                                                                                                                            |
| Background or inactive                 | Ownership is not released. The runtime is not marked dead                                                                                                                                               |

Assumptions and limits:

- One JavaScript realm owns a database. Two isolated processes are not coordinated beyond the fence.
- Fast Refresh keeps `globalThis`. `openReactNativeEngine` returns the existing engine for that database name. A full reload does not.
- Lease expiry alone is not proof the executor stopped. The Node adapter does not use this rule. Its pid file still does.
- Heartbeats use timers. Suspension freezes them. Exclusive ownership is what keeps the suspended owner in place.
- This does not schedule native background work. A killed app resumes on the next time the runtime starts.
- Two devices still must not own one run. Nothing in this package transfers ownership between devices.

## Lifecycle API

```typescript
const engine = openReactNativeEngine({
  database: "larkx.db",
  workflows: [notes],
});

bindReactNativeLifecycle(engine);
await engine.recover();
```

`reactNativeSqliteStorage({ database: "larkx.db" })` is the storage object for `createEngine` from `@larkx/core`. The caller registers the owner with `registerLiveOwner` before starting work. `openReactNativeEngine` does that itself.

`useLarkxRun` only reads snapshots and events. Unmounting it does not release the run.

Connectivity comes from `expo-network` when the app becomes active. Offline does not fail a local workflow. Coming online calls `recover()` again. The local runtime still does not enter `WAITING`.

## Artifacts

`importDurableArtifact` reads a temporary URI, writes the bytes under the application document directory `larkx-artifacts`, checks the written bytes, and only then inserts the artifact row. A step handler must finish that import before it returns a reference.

The same artifact id is reused when the durable file is still present and its hash matches, including when the temporary source has already disappeared. A missing source with no durable copy fails the import. A second hash for the same id is rejected.

Cleanup is not automatic. A crash after the file write and before the metadata insert leaves a file that the next import of that id overwrites. A partial file whose hash does not match is not treated as durable. Remote upload is not implemented. The application deletes artifacts it no longer needs. The database file itself is not encrypted.

## Validation split

| Kind                      | What exists                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Unit and Node integration | Ownership, exclusive leases, lifecycle binding, artifact reuse, and the shared storage cases that do not assume Node lease stealing |
| Process death             | `SIGKILL` of a Node process using the mobile storage policy and `node:sqlite`                                                       |
| Emulator                  | Not run for this change                                                                                                             |
| Physical device           | Not run for this change                                                                                                             |

Do not read a green Node suite as Expo Go, Android, or iOS validation.
