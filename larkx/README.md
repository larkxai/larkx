# 🤖 Agent Management System (AMS) — MVP

Build a modular, extensible platform where developers and HR teams can create **AI-driven agents** to automate hiring processes. This MVP is built with **Next.js + TypeScript + Prisma**, and focuses on:

- ✅ `FormAgent` (collecting application data)
- ✅ `ReminderAgent` (automated follow-ups)
- ✅ Candidate-facing smart link
- 🧱 Extensible agent system
- 🧠 Registry + orchestrator logic
- 📊 Stage tracking (updated by agents)

---

## 📦 File Structure (Initial Plan)

/ams-core
├── /agents
│ ├── AgentBase.ts # Abstract agent class with lifecycle methods
│ ├── FormAgent.ts
│ ├── ReminderAgent.ts
│ └── SchedulerAgent.ts # Optional (future)
│
├── /core
│ ├── AgentRegistry.ts # Central registry of agent types
│ └── AgentOrchestrator.ts # Executes the next agent per candidate
│
├── /lib
│ ├── formRenderer.ts # Utility to render dynamic fields
│ ├── stage.ts # Stage helper (update + history)
│ ├── prisma.ts # Prisma client
│ └── messaging.ts # SendGrid/Twilio integrations
│
├── /pages
│ └── /apply/[candidateId].tsx # Candidate-facing form
│
├── /api
│ └── /agent/trigger.ts # Triggers agent execution
│
├── /prisma
│ └── schema.prisma # DB models (Candidate, Job, Agent)
│
├── /types
│ ├── agent.ts # AgentConfig, AgentContext types
│ └── job.ts # FormField, Job config


---

## 🧠 Agent Base Class

```ts
// agents/AgentBase.ts
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

🔧 Agent Registry
// core/AgentRegistry.ts
import { ReminderAgent } from "../agents/ReminderAgent";
import { FormAgent } from "../agents/FormAgent";

export const RegisteredAgents = {
  ReminderAgent,
  FormAgent,
};

export function createAgentInstance(type: string, context: AgentContext): Agent {
  const AgentClass = RegisteredAgents[type];
  if (!AgentClass) throw new Error("Unknown agent type");
  return new AgentClass(context);
}

// core/AgentOrchestrator.ts
export class AgentOrchestrator {
  async runNextAgent(candidateId: string) {
    const candidate = await getCandidate(candidateId);
    const job = await getJob(candidate.jobId);
    const nextAgent = job.agents.find(a => !candidate.completedAgents.includes(a.id));

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

// lib/stage.ts
const STAGE_MAP = {
  FormAgent: "form_submitted",
  ReminderAgent: "reminder_sent",
  SchedulerAgent: "interview_scheduled"
};

export function getNextStageForAgent(agentType: string): string {
  return STAGE_MAP[agentType] || "unknown";
}

export async function updateCandidateStage(candidateId: string, stage: string) {
  // DB update logic here
}

🧾 Prisma Schema
model Job {
  id     String  @id @default(cuid())
  title  String
  agents Agent[]
}

model Agent {
  id     String @id @default(cuid())
  job    Job    @relation(fields: [jobId], references: [id])
  jobId  String
  type   String
  config Json
  order  Int
}

model Candidate {
  id                String   @id @default(cuid())
  jobId             String
  formData          Json
  completedAgents   String[]
  currentStage      String?
  createdAt         DateTime @default(now())
}

📄 Dynamic Form Config (FormAgent)
JSON Example stored in Agent.config:
{
  "fields": [
    { "name": "fullName", "label": "Full Name", "type": "text", "required": true },
    { "name": "hasLicense", "label": "Do you have a driver’s license?", "type": "boolean" }
  ]
}

🧑‍💻 Dynamic Form Renderer
// lib/formRenderer.ts
export function renderForm(schema: FormField[]) {
  return schema.map((field, idx) => {
    switch (field.type) {
      case "text": return <input key={idx} name={field.name} required={field.required} />;
      case "boolean": return <input type="checkbox" key={idx} name={field.name} />;
      // Add select, number, etc.
    }
  });
}



🔁 ReminderAgent Example
export class ReminderAgent extends Agent {
  async onTrigger() {
    const { candidateId, config } = this.context;
    const candidate = await getCandidate(candidateId);
    if (!candidate.formCompletedAt) {
      await sendReminderEmail(candidate.email, config.message || "Finish your application!");
    }
    await this.onComplete();
  }
}


🧪 API Endpoint to trigger orchestrator
// /api/agent/trigger.ts
export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const { candidateId } = req.body;
  await new AgentOrchestrator().runNextAgent(candidateId);
  res.status(200).json({ ok: true });
}


📌 MVP Deliverables (Cursor Tasks)
 Create schema.prisma with Job, Agent, Candidate

 Build FormAgent + render dynamic form in /apply/[candidateId]

 Store candidate progress + formData

 Implement ReminderAgent with interval run

 Implement AgentOrchestrator

 Add getNextStageForAgent() and updateCandidateStage() logic

 API to trigger orchestrator


🧠 Post-MVP Ideas
Visual agent canvas (Figma → drag-and-drop agent setup)

Conditional logic between agents (score-based routing)

Agent SDK for external developers

Agent templates and bundles

Calendar-aware SchedulerAgent

Real-time agent logs and audit trail

In your architecture, the order of agents for each job is explicitly defined in the Agent model using the order field.

🧭 How the system knows what’s next:
🔢 Step 1: Agent ordering is defined per job
In your Agent model:

prisma
Copy
Edit
model Agent {
  id     String  @id @default(cuid())
  jobId  String
  type   String
  config Json
  order  Int      // <--- Defines sequence
}
When you define agents for a job, you set:

ts
Copy
Edit
[
  { type: "FormAgent", order: 1 },
  { type: "ScreeningAgent", order: 2 },
  { type: "SchedulerAgent", order: 3 }
]
🔄 Step 2: The AgentOrchestrator finds the next uncompleted agent with the lowest order
ts
Copy
Edit
const nextAgent = job.agents
  .filter(agent => !candidate.completedAgents.includes(agent.id))
  .sort((a, b) => a.order - b.order)[0];
That gives you the first agent that hasn’t run yet, in order.

📥 Step 3: When candidate opens their link
At route: /apply/[candidateId]

Backend loads:

Candidate

Job

Ordered list of agents

Orchestrator determines the next agent to run

That agent renders the form, reminder, etc.

After completion, the agent:

Marks itself as done (candidate.completedAgents.push(agent.id))

Updates candidate stage

The orchestrator is called again to move to the next one

✅ What this means for you:
You can fully control the pipeline per job just by:

Defining agent types

Setting their order field

Letting the orchestrator do the rest

No hardcoding. No workflow diagrams. Just plug-and-play logic.

## 🖥️ UI Architecture: Agent-Oriented Flow Editor

The AMS UI is designed to support both **linear workflows** (e.g. Form → Screening → Schedule) and **passive agents** (e.g. ReminderAgent, DropoffTrackerAgent).

### 📐 Layout Overview

```
| Sidebar (Hierarchy) | Canvas (Agent Graph)        | Properties Panel     |
|---------------------|-----------------------------|----------------------|
| Job > Agent list    | Drag-and-drop visual flow   | Agent config + logs  |
```

### 🔹 Left Panel: Hierarchy
- Lists jobs and their assigned agents
- Drag to reorder agents (affects execution order)
- Clicking an agent:
  - Focuses it on the canvas
  - Loads its config in Properties

### 🔹 Center Panel: Canvas
- Displays connected agents by `order` (1 → 2 → 3)
- Passive agents (e.g. ReminderAgent) appear **detached** with unique markers
- Clicking an agent opens its config
- Arrows connect sequential agents
- Icons or badges indicate:
  - 🔄 Passive agent
  - ⚠️ Incomplete config
  - ✅ Configured

### 🔹 Right Panel: Properties
- Shows selected agent's metadata:
  - Type (FormAgent, ReminderAgent, etc.)
  - Created at, updated at
  - Trigger type
  - Version / author (optional)
- Includes inline config editor:
  - FormAgent → dynamic field builder
  - ReminderAgent → delay config
  - SchedulerAgent → calendar sync

### 💡 Optional Enhancements
- Stage preview: shows what `stage` each agent sets
- Simulation: dry-run the flow with dummy data
- Version control for agent configs
- Agent run logs: number of triggers, completion %, last run

---