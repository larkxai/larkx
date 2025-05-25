# 🤖 Agent Management System (AMS) — Platform MVP

The **Agent Management System (AMS)** is a modular, extensible platform that allows internal teams and external developers to build and orchestrate AI-driven agents to automate hiring processes.

This MVP is built with **Next.js + TypeScript + Prisma**, and supports:

- ✅ Core agent lifecycle system
- ✅ Public SDK for developer-built agents
- ✅ Orchestrated agent flows (via AgentFlow)
- ✅ Candidate-facing experience
- ✅ Built-in agents (FormAgent, ReminderAgent)
- 📊 Stage tracking per candidate

---

## 🧱 File Structure

```
---backend
/ams-core
├── /sdk                     # 🟢 Public Agent SDK for external developers
│   ├── AgentBase.ts         # Agent lifecycle: onInit, onTrigger, onComplete
│   ├── types.ts             # AgentContext, AgentConfig, etc.
│   ├── registry.ts          # registerAgent(type, class) — plugin-style
│   └── decorators.ts        # Optional behaviors: @Scheduled, @Retryable

├── /internal-agents         # 🔒 Your default agent implementations
│   ├── FormAgent.ts
│   ├── ReminderAgent.ts
│   └── SchedulerAgent.ts

├── /core
│   ├── AgentOrchestrator.ts # Core engine: runs next agent in a flow
│   └── FlowExecutor.ts      # Flow management logic

├── /lib
│   ├── formRenderer.ts      # Render form fields from JSON schema
│   ├── messaging.ts         # Email/SMS integration
│   ├── stage.ts             # Track & update candidate stage
│   └── prisma.ts            # Prisma client

├── /pages
│   └── /apply/[candidateId].tsx  # Candidate-facing dynamic page

├── /api
│   └── /agent/trigger.ts    # Trigger agent run manually or externally

├── /prisma
│   └── schema.prisma        # Data models

├── /types
│   ├── job.ts               # Job config, FormField[]
│   └── candidate.ts         # Candidate context types
```

---

## 🧠 Public Agent SDK (for developers)

### AgentBase.ts

```ts
export type AgentContext = {
  candidateId: string;
  jobId: string;
  config: any;
  trigger: "system" | "time" | "user";
};

export abstract class Agent {
  constructor(public context: AgentContext) {}
  async onInit(): Promise<void> {}
  abstract onTrigger(): Promise<void>;
  async onMessage(_msg: any): Promise<void> {}
  async onComplete(): Promise<void> {}
}
```

---

### registry.ts

```ts
const agentMap: Record<string, new (ctx: AgentContext) => Agent> = {};

export function registerAgent(type: string, clazz: new (ctx: AgentContext) => Agent) {
  agentMap[type] = clazz;
}

export function createAgentInstance(type: string, context: AgentContext): Agent {
  const AgentClass = agentMap[type];
  if (!AgentClass) throw new Error(`Unknown agent: ${type}`);
  return new AgentClass(context);
}
```

---

## 🔧 Internal Example: ReminderAgent

```ts
export class ReminderAgent extends Agent {
  async onTrigger() {
    const { candidateId } = this.context;
    const candidate = await getCandidate(candidateId);
    if (!candidate.formCompletedAt) {
      await sendReminderEmail(candidate.email, "Don't forget to apply!");
    }
    await this.onComplete();
  }
}
```

---

## 🔁 Orchestrator

```ts
export class AgentOrchestrator {
  async runNextAgent(candidateId: string) {
    const candidate = await getCandidate(candidateId);
    const job = await getJob(candidate.jobId);
    const flow = await getAgentFlow(job.flowId);

    const nextAgent = flow.agents.find(a => !candidate.completedAgents.includes(a.id));
    if (!nextAgent) return;

    const context = {
      candidateId,
      jobId: job.id,
      config: nextAgent.config,
      trigger: "system"
    };

    const agent = createAgentInstance(nextAgent.type, context);
    await agent.onTrigger();

    await markAgentComplete(candidateId, nextAgent.id);
    await updateCandidateStage(candidateId, getNextStageForAgent(nextAgent.type));
  }
}
```

---

## 📊 Stage Management

```ts
const STAGE_MAP = {
  FormAgent: "form_submitted",
  ReminderAgent: "reminder_sent",
  SchedulerAgent: "interview_scheduled"
};

export function getNextStageForAgent(agentType: string): string {
  return STAGE_MAP[agentType] || "unknown";
}

export async function updateCandidateStage(candidateId: string, stage: string) {
  // update DB
}
```

---

## 🔄 AgentFlow: Structured Flows per Job

```prisma
model AgentFlow {
  id          String     @id @default(cuid())
  name        String
  description String?
  createdBy   String
  isTemplate  Boolean    @default(false)
  version     Int        @default(1)
  agents      Agent[]
  createdAt   DateTime   @default(now())
}

model Agent {
  id         String    @id @default(cuid())
  flowId     String
  flow       AgentFlow @relation(fields: [flowId], references: [id])
  type       String
  config     Json
  order      Int
  mode       AgentMode @default(Linear)
}

model Job {
  id         String   @id @default(cuid())
  title      String
  flowId     String
  flow       AgentFlow @relation(fields: [flowId], references: [id])
}

enum AgentMode {
  Linear
  Passive
}
```

---

## 🖥️ UI Flow Editor

| Panel      | Function                                  |
|------------|-------------------------------------------|
| Left       | Job + agents hierarchy (reorder, group)   |
| Center     | Graph/canvas showing flow between agents  |
| Right      | Agent configuration + metadata            |

Features:
- Add agents from a sidebar
- Drag to connect/order
- Passive agents float unconnected (e.g. ReminderAgent)
- Inline config editor for each agent type

---

## 🧪 API Trigger Example

```ts
export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const { candidateId } = req.body;
  await new AgentOrchestrator().runNextAgent(candidateId);
  res.status(200).json({ ok: true });
}
```

---

## 📌 MVP Deliverables

- [x] Agent SDK with lifecycle + registration
- [x] Internal FormAgent + ReminderAgent
- [x] AgentOrchestrator that handles flow
- [x] AgentFlow + Job linking
- [x] Form rendering and resume link
- [x] Candidate stage tracking
- [x] API trigger endpoint

---

## 🧠 Future Ideas

- Agent versioning + rollback
- Agent marketplace
- Public template flows
- AI-generated agent sequences
- Integration SDKs: calendar, CRMs, ATSs

---

# ✅ Ready to Build!