# Rust migration

Rust is a possible later implementation language for the state machine and for storage on platforms that should not carry a JavaScript runtime. It is not a current dependency, and this repository should not grow a Rust crate ahead of a measured reason.

## Why it might be worth it later

- A smaller native core for Swift and Kotlin.
- Embedded Linux and other tight environments.
- A measured cost in the TypeScript reducer or SQLite path that a native implementation would remove.

## What has to stay stable

- Protocol version 1 types and the compatibility rule.
- The workflow and step transition tables.
- Canonical JSON and the error codes.
- Storage invariants: one atomic apply, epoch fencing, authoritative step rows, append-only events.
- Conformance tests that a second implementation can run against the same cases.

The TypeScript `defineWorkflow` callback is application code. A Rust state machine does not execute that callback unless it is hosted in a JavaScript runtime. The split to preserve is: durable state and transitions on one side, workflow control flow on the other.

## What not to do

- Rewrite the engine in Rust before the TypeScript semantics are the ones the tests describe.
- Assume a Rust port can take a closure captured in a React Native workflow and run it on a worker.
- Change public TypeScript types casually once applications depend on them. Internal storage layouts can migrate with a schema version.
