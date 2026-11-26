# Device procedure for Cloud export

Not completed. No phone has uploaded a journal from this repository.

The native runtime can export a metadata-only batch when the application passes telemetry. Node tests cover the cursor, the historical-run boundary, shutdown, and the JavaScript redirect contract. They are not a device run. React Native 0.88 follows redirects inside `NSURLSession` and OkHttp, and Hermes identifier generation has not been run on a phone. The checks that remain are in [on-device-agent.md](on-device-agent.md#telemetry): metadata only, no prompt or tool output, no export of a run that finished before telemetry was enabled, the same run id before and after force-quit, a prompt close while the collector is down, and a `302` that does not deliver the ingestion key to another host. Cloud must accept storage schema 3 before a phone upload can succeed. Delete the agent database and the telemetry store together on reset. This file is not that result.
