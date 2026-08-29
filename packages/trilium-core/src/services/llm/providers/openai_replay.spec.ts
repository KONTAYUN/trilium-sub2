import type { LlmOpenAiResponsesReplayState } from "@triliumnext/commons";
import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
    createOpenAiReplayState,
    isCompatibleOpenAiReplayState,
    restoreOpenAiReplayMessages
} from "./openai_replay.js";

const CONFIG = { providerId: "openai-sub2" };
const MODEL = "gpt-5.6-luna";

function responseMessages(): ModelMessage[] {
    return [
        {
            role: "assistant",
            content: [
                {
                    type: "reasoning",
                    text: "",
                    providerOptions: {
                        openai: {
                            itemId: "rs_test_1",
                            reasoningEncryptedContent: "encrypted-test-payload"
                        }
                    }
                },
                {
                    type: "tool-call",
                    toolCallId: "call_test_1",
                    toolName: "search_notes",
                    input: { query: "alpha" },
                    providerOptions: { openai: { itemId: "fc_test_1" } }
                }
            ]
        },
        {
            role: "tool",
            content: [
                {
                    type: "tool-result",
                    toolCallId: "call_test_1",
                    toolName: "search_notes",
                    output: { type: "json", value: { noteIds: [ "note-1" ] } }
                }
            ]
        },
        {
            role: "assistant",
            content: [
                {
                    type: "reasoning",
                    text: "checked the note",
                    providerOptions: {
                        openai: {
                            itemId: "rs_test_2",
                            reasoningEncryptedContent: "encrypted-test-payload-2"
                        }
                    }
                },
                {
                    type: "text",
                    text: "The note contains alpha.",
                    providerOptions: {
                        openai: { itemId: "msg_test_1", phase: "final_answer" }
                    }
                }
            ]
        }
    ];
}

describe("OpenAI stateless replay state", () => {
    it("round-trips AI SDK reasoning and function tool messages through JSON", () => {
        const messages = responseMessages();
        const state = createOpenAiReplayState(messages, CONFIG, MODEL)!;
        const persisted = JSON.parse(JSON.stringify(state)) as LlmOpenAiResponsesReplayState;

        expect(persisted).not.toBe(state);
        expect(persisted.responseMessages).toEqual(messages);
        expect(restoreOpenAiReplayMessages(persisted, CONFIG, MODEL)).toEqual(messages);
        expect(JSON.stringify(persisted)).toContain("reasoningEncryptedContent");
    });

    it("requires the exact provider configuration and model", () => {
        const state = createOpenAiReplayState(responseMessages(), CONFIG, MODEL)!;

        expect(isCompatibleOpenAiReplayState(state, CONFIG, MODEL)).toBe(true);
        expect(restoreOpenAiReplayMessages(
            state,
            { providerId: "other-openai" },
            MODEL
        )).toBeUndefined();
        expect(restoreOpenAiReplayMessages(state, CONFIG, "gpt-5.6-terra")).toBeUndefined();
        expect(restoreOpenAiReplayMessages(
            { ...state, provider: "anthropic" },
            CONFIG,
            MODEL
        )).toBeUndefined();
    });

    it.each([
        [ undefined, undefined, false ],
        [ undefined, "openai-sub2", false ],
        [ "openai-sub2", undefined, false ],
        [ "openai-other", "openai-sub2", false ],
        [ "openai-sub2", "openai-sub2", true ]
    ])("matches provider IDs fail-closed (%s / %s)", (stateProviderId, configProviderId, expected) => {
        const state = {
            ...createOpenAiReplayState(responseMessages(), CONFIG, MODEL)!,
            providerId: stateProviderId
        };

        expect(isCompatibleOpenAiReplayState(state, { providerId: configProviderId }, MODEL)).toBe(expected);
        expect(restoreOpenAiReplayMessages(state, { providerId: configProviderId }, MODEL) !== undefined).toBe(expected);
    });

    it("rejects the same provider ID with a different model", () => {
        const state = createOpenAiReplayState(responseMessages(), CONFIG, MODEL)!;

        expect(isCompatibleOpenAiReplayState(state, CONFIG, "gpt-5.6-terra")).toBe(false);
        expect(restoreOpenAiReplayMessages(state, CONFIG, "gpt-5.6-terra")).toBeUndefined();
    });

    it("does not create replay state without a non-empty provider ID", () => {
        expect(createOpenAiReplayState(responseMessages(), {}, MODEL)).toBeUndefined();
        expect(createOpenAiReplayState(responseMessages(), { providerId: "" }, MODEL)).toBeUndefined();
        expect(createOpenAiReplayState(responseMessages(), { providerId: "   " }, MODEL)).toBeUndefined();
    });

    it("preserves native web_search call/result parts as opaque AI SDK output", () => {
        const hostedToolMessages: ModelMessage[] = [ {
            role: "assistant",
            content: [
                {
                    type: "tool-call",
                    toolCallId: "ws_test_1",
                    toolName: "web_search",
                    input: {},
                    providerExecuted: true
                },
                {
                    type: "tool-result",
                    toolCallId: "ws_test_1",
                    toolName: "web_search",
                    output: {
                        type: "json",
                        value: {
                            action: { type: "search", queries: [ "Trilium Sub2" ] },
                            sources: [ { type: "url", url: "https://example.test/result" } ]
                        }
                    }
                }
            ]
        } ];

        const state = createOpenAiReplayState(hostedToolMessages, CONFIG, MODEL)!;
        expect(restoreOpenAiReplayMessages(
            JSON.parse(JSON.stringify(state)),
            CONFIG,
            MODEL
        )).toEqual(hostedToolMessages);
    });

    it("rejects empty, non-response, and malformed persisted messages", () => {
        expect(() => createOpenAiReplayState(
            [],
            CONFIG,
            MODEL
        )).toThrow(/replay state is invalid/i);

        const base = createOpenAiReplayState(responseMessages(), CONFIG, MODEL)!;
        expect(() => restoreOpenAiReplayMessages({
            ...base,
            responseMessages: [ { role: "user", content: "not response output" } ]
        }, CONFIG, MODEL)).toThrow(/replay state is invalid/i);
        expect(() => restoreOpenAiReplayMessages({
            ...base,
            responseMessages: [ { role: "assistant", content: [ { type: "reasoning" } ] } ]
        }, CONFIG, MODEL)).toThrow(/replay state is invalid/i);
    });
});
