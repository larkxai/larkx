# State machines

The tables in `@larkxai/protocol` are the legal transitions. The reducer in `@larkxai/core` is the only writer that applies them. Both storage adapters call that reducer inside a transaction or a mutex. An illegal transition throws `invalid_state_transition` and leaves the previous state in place.

## Workflow

| From                               | To                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `CREATED`                          | `RUNNING`, `CANCELLED`, `BLOCKED`                                      |
| `RUNNING`                          | `WAITING`, `RECOVERING`, `COMPLETED`, `FAILED`, `CANCELLED`, `BLOCKED` |
| `WAITING`                          | `RUNNING`, `RECOVERING`, `CANCELLED`, `FAILED`, `BLOCKED`              |
| `RECOVERING`                       | `RUNNING`, `WAITING`, `COMPLETED`, `FAILED`, `CANCELLED`, `BLOCKED`    |
| `BLOCKED`                          | `RUNNING`, `RECOVERING`, `FAILED`, `CANCELLED`                         |
| `COMPLETED`, `FAILED`, `CANCELLED` | none                                                                   |

`WAITING` is reserved for connectivity and remote results. The local runtime does not enter it.

`BLOCKED` is not a crash. It means the runtime will not guess. Resume is a no-op until reconcile, cancellation, or an explicit fail. `CREATED` becomes `BLOCKED` when the workflow version is not registered or the stored protocol version is not 1.

A completion that races with `cancel_requested` is stored as `CANCELLED` instead of `COMPLETED`.

Terminal states do not return to `RUNNING`.

## Steps

| From                               | To                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `PENDING`                          | `RUNNING`, `CANCELLED`                                                                     |
| `RUNNING`                          | `COMPLETED`, `FAILED`, `WAITING_REMOTE`, `RETRY_SCHEDULED`, `UNKNOWN_OUTCOME`, `CANCELLED` |
| `WAITING_REMOTE`                   | `COMPLETED`, `FAILED`, `RETRY_SCHEDULED`, `UNKNOWN_OUTCOME`, `CANCELLED`                   |
| `RETRY_SCHEDULED`                  | `RUNNING`, `CANCELLED`, `FAILED`                                                           |
| `UNKNOWN_OUTCOME`                  | `RETRY_SCHEDULED`, `COMPLETED`, `FAILED`, `CANCELLED`                                      |
| `COMPLETED`, `FAILED`, `CANCELLED` | none                                                                                       |

`RUNNING` is not automatically `FAILED` after a crash. The next owner either schedules a retry or records `UNKNOWN_OUTCOME`.

`WAITING_REMOTE` is in the contract for a later dispatcher. Local steps do not use it.

## Attempts

Each entry into a handler creates an attempt: `STARTED`, then `COMPLETED`, `FAILED`, `INTERRUPTED`, or `CANCELLED`. Attempt numbers increase. The operation id does not.
