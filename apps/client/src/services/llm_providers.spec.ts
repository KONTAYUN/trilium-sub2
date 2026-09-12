import { beforeEach, describe, expect, it, vi } from "vitest";

const getJson = vi.hoisted(() => vi.fn());
vi.mock("./options.js", () => ({ default: { getJson } }));
vi.mock("./i18n.js", () => ({ t: (key: string) => key }));

import { readSelectedModels } from "./llm_providers.js";

describe("saved OpenAI model capabilities", () => {
    beforeEach(() => getJson.mockReset());

    it("enriches existing GPT-6 selections and replaces stale capabilities without rewriting saved data", () => {
        const configs = [{
            id: "relay", name: "My relay", provider: "openai", selectedModels: [
                { id: "gpt-6", name: "GPT-6", contextWindow: 12345, pricing: { input: 1, output: 2 } },
                { id: "gpt-6-astra", name: "Astra", supportedReasoningEfforts: ["ultra"], defaultReasoningEffort: "ultra" }
            ]
        }];
        const original = JSON.stringify(configs);
        getJson.mockReturnValue(configs);
        const { models, groups } = readSelectedModels();
        expect(models).toHaveLength(2);
        for (const model of models) {
            expect(model).toMatchObject({
                provider: "openai", providerId: "relay", providerName: "My relay",
                supportedReasoningEfforts: ["minimal", "low", "medium", "high", "xhigh", "max"],
                defaultReasoningEffort: "medium"
            });
        }
        expect(models[0]).toMatchObject({ contextWindow: 12345, pricing: { input: 1, output: 2 } });
        expect(groups[0].models).toEqual(models);
        expect(JSON.stringify(configs)).toBe(original);
    });

    it("does not infer OpenAI capabilities for other providers or custom aliases", () => {
        getJson.mockReturnValue([
            { id: "local", name: "Local", provider: "ollama", selectedModels: [{ id: "gpt-6", name: "Local GPT" }] },
            { id: "relay", name: "Relay", provider: "openai", selectedModels: [{ id: "gpt6", name: "Alias" }] }
        ]);
        for (const model of readSelectedModels().models) {
            expect(model.supportedReasoningEfforts).toBeUndefined();
        }
    });
});
