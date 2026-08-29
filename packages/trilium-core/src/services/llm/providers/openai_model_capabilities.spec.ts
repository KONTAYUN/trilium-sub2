import { describe, expect, it } from "vitest";

import { enrichOpenAiModel, getOpenAiModelCapabilities } from "./openai_model_capabilities.js";

describe("OpenAI model capabilities", () => {
    it("declares only the requested GPT-5.6 family with medium as the default", () => {
        for (const modelId of ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
            expect(getOpenAiModelCapabilities(modelId)).toEqual({
                supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
                defaultReasoningEffort: "medium"
            });
        }
        expect(getOpenAiModelCapabilities("gpt-5.5")).toBeUndefined();
        expect(getOpenAiModelCapabilities("gpt-5.6-luna-max")).toBeUndefined();
    });

    it("enriches without replacing price/context metadata or mutating the source", () => {
        const source = {
            id: "gpt-5.6-luna",
            name: "GPT-5.6 Luna",
            contextWindow: 1_050_000,
            pricing: { input: 0.2, output: 1.2 }
        };
        const enriched = enrichOpenAiModel(source);

        expect(enriched).toMatchObject({
            ...source,
            supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
            defaultReasoningEffort: "medium"
        });
        expect(enriched).not.toBe(source);
        expect(source).not.toHaveProperty("supportedReasoningEfforts");
    });
});
