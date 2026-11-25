# Rust

Superseded. LarkX runs on the C++ engine in `native/`. A Rust port is not planned, and this repository should not grow a Rust crate.

The decisions that still hold are the ones the C++ runtime implements: one state machine, storage written by that state machine, and model providers kept outside the core. The historical write-up of a TypeScript-to-Rust split is not a current design.
