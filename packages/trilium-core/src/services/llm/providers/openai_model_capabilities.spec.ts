import { describe, expect, it } from "vitest";

import { enrichOpenAiModel, getOpenAiModelCapabilities } from "./openai_model_capabilities.js";

describe("OpenAI model capabilities", () => {
    it("preserves the GPT-5.6 family with medium as the default", () => {
        for (const modelId of ["gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
            expect(getOpenAiModelCapabilities(modelId)).toEqual({
                supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
                defaultReasoningEffort: "medium"
            });
        }
        expect(getOpenAiModelCapabilities("gpt-5.5")).toBeUndefined();
        expect(getOpenAiModelCapabilities("gpt-5.6-luna-max")).toBeUndefined();
    });

    it("recognizes exact GPT-6 IDs with their model-specific efforts", () => {
        for (const modelId of ["gpt-6", "gpt-6-astra"]) {
            expect(getOpenAiModelCapabilities(modelId)).toEqual({
                supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
                defaultReasoningEffort: "medium"
            });
        }
        for (const modelId of ["gpt-6-sol", "gpt-6-luna"]) {
            expect(getOpenAiModelCapabilities(modelId)).toEqual({
                supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
                defaultReasoningEffort: "medium"
            });
        }
        for (const modelId of ["gpt6", "gpt-6-pro", "gpt-6-unknown", "constructor", "toString"]) {
            expect(getOpenAiModelCapabilities(modelId)).toBeUndefined();
        }
    });

    it("excludes unsupported Astra efforts", () => {
        expect(getOpenAiModelCapabilities("gpt-6-astra")?.supportedReasoningEfforts)
            .toEqual(["low", "medium", "high", "xhigh", "max"]);
        expect(getOpenAiModelCapabilities("gpt-6-astra")?.supportedReasoningEfforts)
            .not.toContain("minimal");
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
