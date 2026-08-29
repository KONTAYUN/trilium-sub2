import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

type RequestBody = {
    include?: string[];
    input?: unknown[];
    store?: boolean;
};

const STATELESS_OPTIONS: OpenAILanguageModelResponsesOptions = {
    store: false,
    include: [ "reasoning.encrypted_content" ]
};

function response(output: unknown[], id: string) {
    return {
        id,
        created_at: 1_800_000_000,
        model: "gpt-5.6-luna",
        output,
        usage: {
            input_tokens: 10,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 5,
            output_tokens_details: { reasoning_tokens: 2 }
        }
    };
}

function reasoning(id: string, encryptedContent: string) {
    return {
        type: "reasoning",
        id,
        encrypted_content: encryptedContent,
        summary: []
    };
}

function message(id: string, text: string) {
    return {
        type: "message",
        role: "assistant",
        id,
        phase: "final_answer",
        content: [ { type: "output_text", text, annotations: [], logprobs: null } ]
    };
}

describe("@ai-sdk/openai stateless Responses payload replay", () => {
    it("replays encrypted reasoning and function tool output after JSON persistence", async () => {
        const replies = [
            response([
                reasoning("rs_test_1", "encrypted-test-payload-1"),
                {
                    type: "function_call",
                    id: "fc_test_1",
                    call_id: "call_test_1",
                    name: "search_notes",
                    arguments: JSON.stringify({ query: "alpha" })
                }
            ], "resp_test_1"),
            response([
                reasoning("rs_test_2", "encrypted-test-payload-2"),
                message("msg_test_1", "The first note contains alpha.")
            ], "resp_test_2"),
            response([
                reasoning("rs_test_3", "encrypted-test-payload-3"),
                message("msg_test_2", "The follow-up remains consistent.")
            ], "resp_test_3")
        ];
        const requestBodies: RequestBody[] = [];
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            requestBodies.push(JSON.parse(String(init?.body)) as RequestBody);
            const reply = replies.shift();
            if (!reply) throw new Error("Unexpected extra Responses request");
            return new Response(JSON.stringify(reply), {
                status: 200,
                headers: { "Content-Type": "application/json" }
            });
        });
        const openai = createOpenAI({
            apiKey: "test-key",
            baseURL: "https://sub2.invalid/v1",
            fetch: fetchMock
        });
        const tools = {
            search_notes: tool({
                inputSchema: z.object({ query: z.string() }),
                execute: async ({ query }) => ({ noteIds: [ "note-1" ], query })
            })
        };

        const firstTurn = await generateText({
            model: openai("gpt-5.6-luna"),
            messages: [ { role: "user", content: "Find alpha in my notes." } ],
            tools,
            stopWhen: stepCountIs(3),
            providerOptions: { openai: STATELESS_OPTIONS }
        });
        const persistedResponseMessages = JSON.parse(
            JSON.stringify(firstTurn.responseMessages)
        ) as ModelMessage[];

        expect(JSON.stringify(persistedResponseMessages)).toContain("reasoningEncryptedContent");
        expect(JSON.stringify(persistedResponseMessages)).toContain("call_test_1");

        await generateText({
            model: openai("gpt-5.6-luna"),
            messages: [
                { role: "user", content: "Find alpha in my notes." },
                ...persistedResponseMessages,
                { role: "user", content: "Does that still hold?" }
            ],
            tools,
            stopWhen: stepCountIs(3),
            providerOptions: { openai: STATELESS_OPTIONS }
        });

        expect(requestBodies).toHaveLength(3);
        expect(requestBodies.every(body => body.store === false)).toBe(true);
        expect(requestBodies.every(body =>
            body.include?.filter(value => value === "reasoning.encrypted_content").length === 1
        )).toBe(true);

        const secondTurnInput = requestBodies[2].input ?? [];
        const reasoningItems = secondTurnInput.filter((item): item is Record<string, unknown> =>
            !!item
            && typeof item === "object"
            && (item as { type?: unknown }).type === "reasoning");
        expect(reasoningItems).toHaveLength(2);
        expect(reasoningItems.map(item => item.encrypted_content)).toEqual([
            "encrypted-test-payload-1",
            "encrypted-test-payload-2"
        ]);
        expect(secondTurnInput).toContainEqual({
            type: "function_call",
            call_id: "call_test_1",
            name: "search_notes",
            arguments: JSON.stringify({ query: "alpha" })
        });
        expect(secondTurnInput).toContainEqual({
            type: "function_call_output",
            call_id: "call_test_1",
            output: JSON.stringify({ noteIds: [ "note-1" ], query: "alpha" })
        });
        expect(secondTurnInput.some(item =>
            !!item
            && typeof item === "object"
            && (item as { type?: unknown }).type === "item_reference"
        )).toBe(false);

        const assistantTextItems = secondTurnInput.filter((item): item is Record<string, unknown> =>
            !!item
            && typeof item === "object"
            && (item as { role?: unknown }).role === "assistant");
        expect(assistantTextItems).toHaveLength(1);
        expect(JSON.stringify(assistantTextItems[0])).toContain("The first note contains alpha.");
    });
});
