import {
  cactusHostModel,
  normalizeCactusCompletion,
  toCactusMessages,
} from "@larkxai/cactus/adapter";
import { LarkxError } from "@larkxai/core";
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
