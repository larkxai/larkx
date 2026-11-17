# LarkX

Durable execution for on-device AI agents.

LarkX is open-source infrastructure for agents that run on phones, edge hardware, and other devices. It is designed to keep a multi-step workflow recoverable when the app is killed, the network is gone, or a step has to move to the cloud.

**Status:** in development. This repository will hold the runtime. There is no installable release yet. The product narrative and the interactive concept demo live at [larkx.ai](https://larkx.ai).

## What it is for

Local models can already run on a device. A multi-step agent also has to remember what it decided, which tools it called, and where to resume. LarkX is that execution layer.

- **Persistent agent state.** Decisions and tool results are written to a local journal and can be replayed after the process dies.
- **Offline-first.** Local reasoning and tools keep running when no orchestration service is reachable.
- **Hybrid execution.** A step can stay on the device or be handed to remote compute with a stable operation id. The device keeps the execution history.

## How this is different

Server-first engines keep workflow state next to the coordinator. If the device cannot reach that coordinator, the workflow cannot advance. LarkX is designed to embed the execution journal on the device. The cloud is optional.

SQLite stores data. WorkManager and BGTaskScheduler ask the operating system to run a task later. A local inference runtime executes a model. LarkX is the durable multi-step agent runtime above those pieces.

## Open source and cloud

The embedded runtime is planned as open source, with no mandatory cloud dependency. LarkX Cloud is the planned commercial control plane. It is intended to charge for managed workflow orchestration and execution volume. Customers bring their own compute.

## Project

- Website: https://larkx.ai
- Organization: https://github.com/larkxai
- Contact: artem.dudynskiy@gmail.com
- License: [Apache-2.0](LICENSE)
