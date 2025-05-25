# 🤖 Agent Management System (AMS) — MVP

Build a modular, extensible platform where developers and HR teams can create **AI-driven agents** to automate hiring processes. This MVP is built with **Next.js + TypeScript + Prisma**, and focuses on:

- ✅ FormAgent (collecting application data)
- ✅ ReminderAgent (automated follow-ups)
- ✅ Candidate-facing smart link
- 🧱 Extensible agent system
- 🧠 Registry + orchestrator logic

---

## 📦 File Structure (Initial Plan)

/ams-core
├── /agents # All available agent implementations
│ ├── AgentBase.ts # Abstract agent class with lifecycle methods
│ ├── FormAgent.ts
│ ├── ReminderAgent.ts
│ └── SchedulerAgent.ts
│
├── /core
│ ├── AgentRegistry.ts # Central registry of agent types
│ └── AgentOrchestrator.ts # Executes the next agent per candidate
│
├── /lib
│ ├── formRenderer.ts # Utility to render dynamic fields
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

🧬 Orchestrator Logic
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
  }
}

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
  id        String @id @default(cuid())
  jobId     String
  formData  Json
  completedAgents String[]
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

 Add agent config and run logic per job



🧠 Post-MVP Ideas
Visual agent canvas (Figma → production UI)

Agent types: ScreeningAgent, OfferAgent, DocumentAgent

Conditions per agent (score > 80 → continue)

Custom agent SDK for devs

Agent marketplace / bundles