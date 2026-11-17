# Security

LarkX stores workflow inputs, step outputs, and error records on the device. Treat the local database as application data, not as a sealed vault.

## What this release does

- The default data policy is `device-only`. A cloud or hybrid step fails with `permission_denied` and does not run its handler.
- `cloud-allowed` still does not send data anywhere. Those steps fail with `unsupported_capability` because no transport is implemented.
- The event journal rejects payload fields named `input`, `output`, `messages`, `prompt`, `toolResult`, and `content`. Step records still store outputs. `getHistory()` is not a redacted export of step results.
- Remote dispatch types require a tenant, an application id, and a data policy, and they reject `device-only`. Nothing in this release transmits them.
- Ownership fencing stops a stale in-process owner from committing. It is not an authentication system.

## What this release does not do

- It does not encrypt the SQLite file, use a secure enclave, or protect the database from a process that can read the file.
- It does not claim GDPR, HIPAA, SOC 2, or any other compliance status.
- It does not authenticate devices, workers, or users. Those controls belong with a future transport and with the private cloud service.
- It does not cancel or roll back an external effect that already happened.
- It does not stop a workflow author from putting secrets inside a step result. Callers should avoid that.

## Reporting

Report a vulnerability through GitHub private security advisories on `larkxai/larkx` when that feature is enabled. Otherwise contact the maintainers privately. Please do not open a public issue for an unfixed vulnerability.

Include the package version, the storage adapter, and a minimal workflow that shows the problem. Do not include private model prompts or production data.
