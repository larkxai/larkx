import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { searchCatalog } from "./catalog.js";

const State = Annotation.Root({
  request: Annotation<string>,
  needsInput: Annotation<boolean>,
  answer: Annotation<string>,
});

const QUESTION = "What is the pump manufacturer's model number?";

let releaseHold: () => void = () => undefined;
let holdGate: Promise<void> = Promise.resolve();
let holdArmed = false;
let onHolding: (() => void) | undefined;

/** Test barrier. The server arms this before a crash or cancellation check. */
export function armProcurementHold(onHold?: () => void): void {
  holdArmed = true;
  onHolding = onHold;
  holdGate = new Promise<void>((resolve) => {
    releaseHold = () => {
      holdArmed = false;
      resolve();
    };
  });
}

export function releaseProcurementHold(): void {
  releaseHold();
}

/**
 * Real LangGraph graph. The deterministic node is the default so CI does not
 * need a model credential. `LARKX_LANGGRAPH_MODEL=openai` with `OPENAI_API_KEY`
 * replaces that node with a chat-completions call. The catalog node still runs.
 */
export function procurementGraph() {
  return new StateGraph(State)
    .addNode("hold", holdForTest)
    .addNode("interpret", interpret)
    .addNode("searchCatalog", catalogNode)
    .addEdge(START, "hold")
    .addEdge("hold", "interpret")
    .addConditionalEdges("interpret", (state) => (state.needsInput ? END : "searchCatalog"))
    .addEdge("searchCatalog", END)
    .compile();
}

export async function runProcurement(
  request: string,
  signal?: AbortSignal,
): Promise<{
  readonly needsInput: boolean;
  readonly answer: string;
  readonly simulated: true;
}> {
  const graph = procurementGraph();
  const state = await graph.invoke(
    { request, needsInput: false, answer: "" },
    signal === undefined ? undefined : { signal },
  );
  return { needsInput: state.needsInput, answer: state.answer, simulated: true };
}

async function holdForTest(
  _state: typeof State.State,
  config?: { signal?: AbortSignal },
): Promise<Partial<typeof State.State>> {
  if (!holdArmed) {
    return {};
  }
  onHolding?.();
  const signal = config?.signal;
  await Promise.race([holdGate, whenAborted(signal)]);
  if (signal?.aborted) {
    throw new Error("Abort");
  }
  return {};
}

function whenAborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal === undefined) {
      return;
    }
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

async function interpret(state: typeof State.State): Promise<Partial<typeof State.State>> {
  if (process.env.LARKX_LANGGRAPH_MODEL === "openai") {
    return interpretWithOpenAI(state.request);
  }
  const hasModel = /model\s+[a-z0-9-]+/i.test(state.request) || /\bp-\d+\b/i.test(state.request);
  if (!hasModel) {
    return { needsInput: true, answer: QUESTION };
  }
  return { needsInput: false, answer: "" };
}

async function interpretWithOpenAI(request: string): Promise<Partial<typeof State.State>> {
  const key = process.env.OPENAI_API_KEY;
  if (key === undefined || key.length === 0) {
    throw new Error("LARKX_LANGGRAPH_MODEL=openai requires OPENAI_API_KEY.");
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            'Reply with JSON only: {"needsInput":boolean,"model":string}. needsInput is true when the user did not name an equipment model.',
        },
        { role: "user", content: request },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI returned HTTP ${String(response.status)}.`);
  }
  const body = (await response.json()) as {
    choices?: readonly { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content) as { needsInput?: boolean; model?: string };
  if (parsed.needsInput === true || typeof parsed.model !== "string" || parsed.model.length === 0) {
    return { needsInput: true, answer: QUESTION };
  }
  return { needsInput: false, answer: parsed.model };
}

async function catalogNode(state: typeof State.State): Promise<Partial<typeof State.State>> {
  const row = searchCatalog(`${state.request}\n${state.answer}`);
  if (row === undefined) {
    return {
      needsInput: false,
      answer: "Simulated catalog: no compatible part was found.",
    };
  }
  return {
    needsInput: false,
    answer: `Simulated supplier: ${row.supplier}. Part ${row.part} for ${row.model}. Estimated price ${String(row.estimatedPrice)}. simulated=true`,
  };
}
