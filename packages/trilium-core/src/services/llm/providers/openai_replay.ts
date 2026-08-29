import type { LlmOpenAiResponsesReplayState } from "@triliumnext/commons";
import {
    assistantModelMessageSchema,
    toolModelMessageSchema,
    type ModelMessage
} from "ai";

import type { LlmProviderConfig } from "../types.js";

const INVALID_REPLAY_STATE = "Stored OpenAI stateless replay state is invalid.";

function isValidProviderId(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/** Whether opaque client state belongs to this exact OpenAI configuration and model. */
export function isCompatibleOpenAiReplayState(
    state: unknown,
    config: LlmProviderConfig,
    model: string
): state is LlmOpenAiResponsesReplayState {
    if (!state || typeof state !== "object") {
        return false;
    }

    const candidate = state as Partial<LlmOpenAiResponsesReplayState>;
    const providerId = config.providerId;
    return candidate.version === 1
        && candidate.provider === "openai"
        && candidate.mode === "stateless-responses"
        && isValidProviderId(candidate.providerId)
        && isValidProviderId(providerId)
        && candidate.providerId === providerId
        && candidate.model === model;
}

/**
 * JSON-round-trip and validate AI SDK response messages before exposing them to
 * the client. This proves the exact representation can survive chat-note
 * persistence and prevents a partially serializable replay state from being
 * marked complete.
 */
export function createOpenAiReplayState(
    responseMessages: ModelMessage[],
    config: LlmProviderConfig,
    model: string
): LlmOpenAiResponsesReplayState | undefined {
    const providerId = config.providerId;
    if (!isValidProviderId(providerId)) {
        return undefined;
    }

    let serialized: unknown;
    try {
        serialized = JSON.parse(JSON.stringify(responseMessages));
    } catch {
        throw new Error(INVALID_REPLAY_STATE);
    }

    const validated = parseResponseMessages(serialized);
    return {
        version: 1,
        provider: "openai",
        mode: "stateless-responses",
        providerId,
        model,
        responseMessages: validated
    };
}

/** Restore opaque persisted state to the AI SDK's own ModelMessage structures. */
export function restoreOpenAiReplayMessages(
    state: unknown,
    config: LlmProviderConfig,
    model: string
): ModelMessage[] | undefined {
    if (!isCompatibleOpenAiReplayState(state, config, model)) {
        return undefined;
    }
    return parseResponseMessages(state.responseMessages);
}

/** Only assistant/tool response messages are valid replay output. */
function parseResponseMessages(value: unknown): ModelMessage[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(INVALID_REPLAY_STATE);
    }

    return value.map((message) => {
        if (!message || typeof message !== "object") {
            throw new Error(INVALID_REPLAY_STATE);
        }

        const role = (message as { role?: unknown }).role;
        const parsed = role === "assistant"
            ? assistantModelMessageSchema.safeParse(message)
            : role === "tool"
                ? toolModelMessageSchema.safeParse(message)
                : undefined;

        if (!parsed?.success) {
            throw new Error(INVALID_REPLAY_STATE);
        }
        return parsed.data;
    });
}
