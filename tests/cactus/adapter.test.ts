import {
  cactusAdapter,
  cactusHostModel,
  normalizeCactusCompletion,
  toCactusMessages,
} from "@larkxai/cactus/adapter";
import type { CactusLanguageModel } from "@larkxai/cactus";
import { LarkxError } from "@larkxai/protocol";
import { describe, expect, it } from "vitest";

const completion = {
  success: true,
  response: "Use the sofa.",
  thinking: "private reasoning that must not be stored",
  functionCalls: [{ name: "save_plan", arguments: { title: "Living room", totalCost: 900 } }],
  timeToFirstTokenMs: 12,
  totalTimeMs: 40,
  prefillTokens: 20,
  decodeTokens: 8,
  totalTokens: 28,
};

describe("Cactus response normalization", () => {
  it("keeps tool calls and drops chain-of-thought", () => {
    const normalized = normalizeCactusCompletion(completion, "qwen3-0.6b-int8");
    expect(normalized.finish).toBe("tool_calls");
    expect(normalized.calls).toEqual([
      {
        id: "call-0",
        name: "save_plan",
        arguments: { title: "Living room", totalCost: 900 },
      },
    ]);
    expect(normalized.usage).toMatchObject({ inputTokens: 20, outputTokens: 8, totalTokens: 28 });
    expect(normalized.timingMs).toEqual({ total: 40, timeToFirstToken: 12 });
    expect(JSON.stringify(normalized)).not.toContain("private reasoning");
    expect(JSON.stringify(normalized)).not.toContain("thinking");
  });

  it("parses stringified tool arguments and rejects a cloud handoff", () => {
    const parsed = normalizeCactusCompletion(
      {
        success: true,
        response: "",
        functionCalls: [
          {
            name: "search_furniture",
            arguments: '{"query":"sofa"}' as unknown as { readonly [key: string]: unknown },
          },
        ],
        timeToFirstTokenMs: 1,
        totalTimeMs: 2,
        prefillTokens: 1,
        decodeTokens: 1,
        totalTokens: 2,
      },
      "qwen3-0.6b-int8",
    );
    expect(parsed.calls[0]?.arguments).toEqual({ query: "sofa" });
    expect(() =>
      normalizeCactusCompletion({ ...completion, cloudHandoff: true }, "qwen3-0.6b-int8"),
    ).toThrow(LarkxError);
  });

  it("formats tool results as user messages because Cactus has no tool role", () => {
    const messages = toCactusMessages([
      { role: "system", content: "Be brief." },
      { role: "user", content: "Plan the room." },
      {
        role: "assistant",
        content: null,
        calls: [{ id: "call-0", name: "get_budget", arguments: {} }],
      },
      { role: "tool", name: "get_budget", callId: "call-0", content: "Untrusted tool output: {}" },
    ]);
    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(messages[3]?.content).toContain("get_budget");
    expect(JSON.stringify(messages)).not.toContain("chain-of-thought");
  });
});

describe("Cactus native host model", () => {
  it("normalizes a native JSON request and surfaces a completion failure", async () => {
    const seen: unknown[] = [];
    const host = cactusHostModel({
      download: async () => undefined,
      init: async () => undefined,
      stop: async () => undefined,
      destroy: async () => undefined,
      getModelName: () => "qwen3-0.6b-int8",
      async complete(request) {
        seen.push(request.messages);
        return {
          success: false,
          response: "",
          timeToFirstTokenMs: 0,
          totalTimeMs: 1,
          prefillTokens: 0,
          decodeTokens: 0,
          totalTokens: 0,
        };
      },
    });
    await expect(
      host.complete(
        {
          messages: [
            { role: "system", content: "Inspect equipment." },
            { role: "user", content: "Pump 12" },
          ],
          tools: [
            {
              name: "read_inspection_notes",
              description: "Read notes",
              inputSchema: { type: "object", properties: {}, required: [] },
            },
          ],
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ code: "transient_execution_failure" });
    expect(JSON.stringify(seen)).toContain("Pump 12");
    expect(host.capabilities).toMatchObject({
      toolCalling: true,
      cancellation: true,
      structuredOutput: false,
    });
  });
});

describe("Cactus inference queue", () => {
  it("cancels a queued completion without stopping the active one", async () => {
    const model = gatingModel();
    const first = cactusAdapter(model);
    const second = cactusAdapter(model);
    const active = new AbortController();
    const queued = new AbortController();
    const running = first.complete(request("one"), { signal: active.signal });
    await waitFor(() => model.active === 1);
    const waiting = second.complete(request("two"), { signal: queued.signal });
    await delay(20);
    expect(model.maxActive).toBe(1);
    queued.abort();
    model.release();
    await expect(running).resolves.toMatchObject({ message: "one" });
    await expect(waiting).rejects.toMatchObject({ code: "cancelled_execution" });
    expect(model.stops).toBe(0);
  });

  it("stops only the active completion on a shared model", async () => {
    const model = gatingModel();
    const adapter = cactusAdapter(model);
    const other = separateModel();
    const active = new AbortController();
    const otherController = new AbortController();
    const running = adapter.complete(request("one"), { signal: active.signal });
    const parallel = cactusAdapter(other).complete(request("other"), {
      signal: otherController.signal,
    });
    await waitFor(() => model.active === 1 && other.active === 1);
    active.abort();
    await waitFor(() => model.stops === 1);
    model.release();
    await expect(running).rejects.toMatchObject({ code: "cancelled_execution" });
    other.release();
    await expect(parallel).resolves.toMatchObject({ message: "other" });
    expect(other.stops).toBe(0);
  });

  it("lets the next agent generate after the cancelled one", async () => {
    const model = gatingModel();
    const adapter = cactusHostModel(model);
    const active = new AbortController();
    const running = adapter.complete(request("one"), { signal: active.signal });
    await waitFor(() => model.active === 1);
    active.abort();
    model.release();
    await expect(running).rejects.toMatchObject({ code: "cancelled_execution" });
    const next = adapter.complete(request("two"), { signal: new AbortController().signal });
    await waitFor(() => model.active === 1);
    model.release();
    await expect(next).resolves.toMatchObject({ message: "two" });
    expect(model.stops).toBe(1);
    expect(model.maxActive).toBe(1);
  });
});

function request(content: string) {
  return {
    messages: [{ role: "user" as const, content }],
    tools: [],
  };
}

function gatingModel(): CactusLanguageModel & {
  active: number;
  maxActive: number;
  stops: number;
  release(): void;
} {
  return separateModel();
}

function separateModel(): CactusLanguageModel & {
  active: number;
  maxActive: number;
  stops: number;
  release(): void;
} {
  let active = 0;
  let maxActive = 0;
  let stops = 0;
  let releaseCurrent: (() => void) | null = null;
  const model: CactusLanguageModel = {
    download: async () => undefined,
    init: async () => undefined,
    destroy: async () => undefined,
    getModelName: () => "qwen3-0.6b-int8",
    stop: async () => {
      stops += 1;
      releaseCurrent?.();
    },
    async complete(params) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const content = params.messages[0]?.content ?? "";
      try {
        await new Promise<void>((resolve) => {
          releaseCurrent = resolve;
        });
        return {
          success: true,
          response: content,
          timeToFirstTokenMs: 1,
          totalTimeMs: 2,
          prefillTokens: 1,
          decodeTokens: 1,
          totalTokens: 2,
        };
      } finally {
        active -= 1;
        releaseCurrent = null;
      }
    },
  };
  return {
    ...model,
    get active() {
      return active;
    },
    get maxActive() {
      return maxActive;
    },
    get stops() {
      return stops;
    },
    release() {
      releaseCurrent?.();
    },
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2_000) {
      throw new Error("Timed out waiting for Cactus queue.");
    }
    await delay(5);
  }
}
