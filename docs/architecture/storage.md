# Storage

`WorkflowStorage` is the transactional API the engine uses. The core never sees SQL.

## Operations

- Create or load a run, and load the full execution state.
- List runs and list recoverable runs (`CREATED`, `RUNNING`, `WAITING`, `RECOVERING`).
- Claim, renew, and release ownership.
- Apply one reducer command: begin a step, commit a step, resolve an attempt, mark an unknown outcome, reconcile, transition the run, or insert an outbox row.
- Request cancellation.
- Insert and read artifact metadata.
- Close.

`apply` is atomic. Related run, step, attempt, and event changes commit together or not at all. Adapters must not write those rows as independent autocommit statements.

`exclusiveOwnership` changes one claim rule. A different owner cannot take the run merely because `leaseExpiresAt` is in the past. The adapter must pass `maySteal: true` for that takeover, which the React Native adapter does only when the previous owner is gone from the current JavaScript realm. Node storage leaves the flag off, so an expired lease can still be taken there.

## Schema version 1

SQLite tables:

| Table               | Role                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `workflow_runs`     | Authoritative run status, input, output, owner, epoch, lease, protocol, data policy                   |
| `workflow_steps`    | Authoritative step status and output. Primary key `(run_id, step_key)`. Unique `(run_id, step_order)` |
| `step_attempts`     | Attempt log                                                                                           |
| `workflow_events`   | Append-only journal. Unique `(run_id, sequence)`                                                      |
| `outbox`            | Durable dispatch intent. Unique `operation_id`. Unused by the engine                                  |
| `artifacts`         | Metadata only. Unused by the engine                                                                   |
| `schema_migrations` | Applied schema versions                                                                               |

Foreign keys are on. The Node driver sets `busy_timeout`, `synchronous=NORMAL`, and WAL when the library accepts it. WAL is ignored when the environment cannot enable it.

Writes use `BEGIN IMMEDIATE`. A failed command rolls back. The conformance suite checks that an illegal transition does not stick.

Events are appended. A rewrite that would change an existing sequence prefix is rejected. Step and attempt rows for a run are replaced from the reduced state inside the same transaction so the adapter cannot drift from the reducer.

## Memory adapter

`createMemoryStorage` keeps the same state in a mutex queue. `close()` rejects later operations. Process exit drops the data. The package README says so because that adapter is for tests and fast feedback, not for crash recovery.

## Artifacts

Large bytes do not belong in the step JSON. A future adapter must put the bytes in durable storage before a committed step result references the artifact id. A temporary camera or cache URI is not a durable artifact until it has been copied or its lifetime has been checked. That copy path is not implemented.

## Migrations

`STORAGE_SCHEMA_VERSION` is 1. A future migration runs inside the SQLite package before the engine uses the connection. The protocol version is not the signal for a schema change.
