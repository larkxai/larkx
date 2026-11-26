# Remote dispatch

Implemented as durable delegation to an independent remote agent. The C++ runtime stores the operation, the client operation id, and, after acceptance, the remote task id. The host sends the HTTP task protocol. The remote agent is not hosted here.

The protocol, recovery rules, cancellation rules, and authorization limits are in [remote-delegation.md](remote-delegation.md).

A2A is the planned interoperability protocol and is not implemented. The HTTP task transport is the current mechanism and the test foundation. A local tool that uses the network on its own is not a delegation. `device-only` remains the default for an agent that registers no remote agents. This repository does not host the remote agent.
