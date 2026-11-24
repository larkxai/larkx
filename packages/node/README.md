# @larkx/node

```bash
npm install @larkx/node
```

Node.js adapter for the LarkX runtime.

`createNodeEngine({ database, workflows })` opens a SQLite file, migrates it, and returns a core engine. The driver is Node's built-in `node:sqlite` module. Node 22 still marks that module experimental and may print a warning when the process loads it.

When a new process opens the same database, it can reclaim a run immediately if the recorded owner's process id is no longer alive. A live process keeps its lease. Lease expiry is the fallback when the owner file and the database disagree. Local execution does not contact a remote lease service.

`createNodeSqliteStorage` is available when an application wants to construct `createEngine` itself.
