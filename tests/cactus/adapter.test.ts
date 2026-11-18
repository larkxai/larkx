import { normalizeCactusCompletion, toCactusMessages } from "@larkx/cactus/adapter";
import { LarkxError } from "@larkx/core";
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
