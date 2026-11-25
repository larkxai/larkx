# Proposal: opt-in input and output tracing

Status: proposal only. `@larkxai/telemetry` version 1 stays `metadata-only`. The C++ runtime does not export telemetry yet. This document does not change the exporter and does not describe the current agent API.

## Why

The Field Assistant demo can show a run id, stage keys, attempts, and recovery in LarkX Cloud. It cannot show what each stage received or returned. Version 1 drops `input`, `output`, `messages`, `prompt`, `toolResult`, and `content`, and it does not copy tool names or model text out of step outputs. That is the right default for inspection notes and reports.

A second, explicit mode would let a project choose to store stage inputs and outputs for a workflow graph. Cloud would still not execute or cancel the workflow.

## Contract

Add telemetry version 2 beside version 1. Do not widen version 1.

- `mode` is `metadata-and-io` only when the host passes `trace: { inputs: true, outputs: true }`.
- The default remains version 1, `metadata-only`, with no stage bodies.
- The phone UI gains a separate control, off by default: "Share stage inputs and outputs with Cloud." Turning it on applies to new runs. It does not rewrite batches already acknowledged.
- The exporter refuses version 2 unless that flag and a project setting both allow it. Either one being off keeps version 1.
- Version 2 bodies add, per stage, the committed input and output already stored on the device, a stage name, and the existing metadata (status, attempt, operation id, timing). They still omit the owner id and local file paths.
- `device-only` continues to block remote execution. Tracing is not a cloud or hybrid step. The dashboard label stays Local.
- A `400 invalid_batch` from a version 1 endpoint must not retry the same body as version 2. The Cloud service accepts version 2 only after `larkxai/cloud` ships the matching route.
- Retention, deletion, and who can open a traced run are Cloud project settings. The phone can delete its local databases without deleting a traced copy already accepted by Cloud. The proposal needs a delete-by-run-id request before the mode ships.
- The Field Assistant would still default to off. Inspection notes and the report leave the device only after that control is on.

## Dashboard

With version 2, a run page can draw the four stages in order and show each stage's input, output, duration, attempts, and recovery marker. With version 1, the same page shows the execution trace without those bodies. The phone remains the place the report is read unless tracing is on.
