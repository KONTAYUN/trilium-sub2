import { describe, expect, it } from "vitest";

import { reasoningControlForModel } from "./reasoning_control.js";

describe("chat reasoning control", () => {
    it("uses an effort selector only for OpenAI models with declared capabilities", () => {
        expect(reasoningControlForModel({
            id: "gpt-5.6-luna",
            name: "GPT-5.6 Luna",
            provider: "openai",
            supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"]
        })).toBe("effort");
        expect(reasoningControlForModel({ id: "gpt-4.1", name: "GPT-4.1", provider: "openai" }))
            .toBe("hidden");
    });

    it("keeps the existing extended-thinking control for Anthropic and Google", () => {
        expect(reasoningControlForModel({ id: "claude", name: "Claude", provider: "anthropic" }))
            .toBe("extended-thinking");
        expect(reasoningControlForModel({ id: "gemini", name: "Gemini", provider: "google" }))
            .toBe("extended-thinking");
    });
});
