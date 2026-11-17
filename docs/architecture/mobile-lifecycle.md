# Mobile lifecycle

This document is a design note. `@larkx/react-native` does not exist. Node tests do not validate iOS or Android.

## What the first mobile adapter should do

- Construct the engine when the JavaScript runtime is up, with the SQLite driver for that platform.
- Call `recover()` for unfinished runs.
- Persist every committed step before returning to application code. The core already commits per step.
- Observe the connectivity signals the platform actually provides, and resume runs that are waiting on the network. The local runtime does not enter `WAITING` yet.
- Expose React hooks only as a thin view of run handles. The engine must keep running if the component that called `start` unmounts.

## What it should not promise

iOS and Android decide whether a process runs. A force-quit app may not restart for a silent push. LarkX can guarantee that a recoverable run continues on the next execution opportunity. It cannot guarantee work while the process is dead.

Do not rely on an expiration handler as the only flush. The step commit is the flush.

Background scheduling, thermal limits, and battery-aware routing wait until there are native adapters that report those facts. The protocol can store a selected target. It should not pretend a heuristic ran.

## Ownership on a phone

A suspended JavaScript timer does not renew a lease. The Node pid file is not a mobile design. M2 should define how a single app process reclaims its own runs after suspension without letting a second thread execute them. Two devices still must not own one run without a coordination protocol.

## Testing

Device or emulator tests to add when the adapter exists:

- Start a workflow, force-quit after a committed step, reopen, and see the handler skipped.
- Complete offline-capable steps with the network off.
- Restore the network and read a remote result, once remote dispatch exists.

Until those run, documentation and release notes should say the mobile adapter is unvalidated.
