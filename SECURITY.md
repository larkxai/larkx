# Security

LarkX stores workflow inputs, step outputs, and error records on the device. Treat the local database as application data, not as a sealed vault.

## What this release does

- The default data policy is `device-only`. An agent with no registered remote agents does not send a delegation.
- Registering a remote agent authorizes one endpoint and the arguments of that call. The conversation, local history, files, and artifacts are not added. A different endpoint on recovery is rejected. Credentials are resolved by the host and are not written to SQLite.
- These checks do not sandbox an ordinary application tool. A local tool can use the network by itself.
- The event journal rejects payload fields named `input`, `output`, `messages`, `prompt`, `toolResult`, and `content`. Delegation events store ids, not the request body or the result. Step records still store outputs. `getHistory()` is not a redacted export of step results.
- Ownership fencing stops a stale in-process owner from committing. It is not an authentication system.

## What this release does not do

- It does not encrypt the SQLite file, use a secure enclave, or protect the database from a process that can read the file.
- It does not claim GDPR, HIPAA, SOC 2, or any other compliance status.
- It does not authenticate devices, workers, or users. The host supplies request headers. Cancelling the local run does not roll back a remote task that the peer already accepted.
- It does not cancel or roll back an external effect that already happened.
- It does not stop a workflow author from putting secrets inside a step result. Callers should avoid that.

## Reporting

Report a vulnerability through GitHub private security advisories on `larkxai/larkx` when that feature is enabled. Otherwise contact the maintainers privately. Please do not open a public issue for an unfixed vulnerability.

Include the package version, the storage adapter, and a minimal workflow that shows the problem. Do not include private model prompts or production data.
