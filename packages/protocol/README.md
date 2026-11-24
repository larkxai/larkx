# @larkx/protocol

```bash
npm install @larkx/protocol
```

Language-independent execution contracts for LarkX.

This package defines workflow and step states, the legal transition tables, effect classes, event names, error codes, payload types, and the remote dispatch request shape. It has no dependency on the runtime or on a platform adapter.

The TypeScript types are the source of the version 1 contract. A future Rust core is expected to implement the same states, transitions, and serialization rules rather than to import this package.

Remote dispatch types are specified here so transports can be built against a stable contract. The local runtime in this release does not send them.
