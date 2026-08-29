import type { ModelInfo } from "../types.js";

/** OpenAI capabilities that are not part of the generated price/context catalog. */
export interface OpenAiModelCapabilities {
    supportedReasoningEfforts: readonly string[];
    defaultReasoningEffort: string;
}

const GPT_5_6_REASONING: OpenAiModelCapabilities = {
    supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium"
};

/**
 * Deliberately small, manually curated capability table. Add a model only when
 * its supported values are known; pricing and context stay in model_prices.json.
 */
const OPENAI_MODEL_CAPABILITIES: Readonly<Record<string, OpenAiModelCapabilities>> = {
    "gpt-5.6": GPT_5_6_REASONING,
    "gpt-5.6-sol": GPT_5_6_REASONING,
    "gpt-5.6-terra": GPT_5_6_REASONING,
    "gpt-5.6-luna": GPT_5_6_REASONING
};

export function getOpenAiModelCapabilities(modelId: string): OpenAiModelCapabilities | undefined {
    return OPENAI_MODEL_CAPABILITIES[modelId];
}

/** Merge manual capabilities into price/remote metadata without mutating either source. */
export function enrichOpenAiModel(model: ModelInfo): ModelInfo {
    const capabilities = getOpenAiModelCapabilities(model.id);
    if (!capabilities) {
        return model;
    }

    return {
        ...model,
        supportedReasoningEfforts: [...capabilities.supportedReasoningEfforts],
        defaultReasoningEffort: capabilities.defaultReasoningEffort
    };
}

export function enrichOpenAiModels(models: ModelInfo[]): ModelInfo[] {
    return models.map(enrichOpenAiModel);
}
