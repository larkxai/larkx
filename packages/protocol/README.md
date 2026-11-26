# @larkxai/protocol

Shared execution contracts for LarkX: workflow and step states, legal transitions, effect classes, event names, error codes, and canonical JSON.

The C++ runtime in `native/` implements the state machine. This package does not import it, and the runtime does not import this package. Remote dispatch types remain so a later transport can be built against them. The current runtime does not send them.

This package is private. It is bundled into `@larkxai/react-native`. The private Node host bundles it for tests. Do not install it on its own.
