/** Shared by the provider and saved-model pickers; independent of pricing. */
export interface OpenAiModelCapabilities {
    supportedReasoningEfforts: readonly string[];
    defaultReasoningEffort: string;
}

const GPT_5_6_REASONING: OpenAiModelCapabilities = {
    supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium"
};

const GPT_6_ASTRA_REASONING: OpenAiModelCapabilities = {
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    // App default, preserving the existing chat selector's medium effort.
    defaultReasoningEffort: "medium"
};

const GPT_6_SOL_LUNA_REASONING: OpenAiModelCapabilities = {
    supportedReasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium"
};

/** Exact IDs only: do not infer capabilities for arbitrary relay aliases. */
const OPENAI_MODEL_CAPABILITIES: Readonly<Record<string, OpenAiModelCapabilities>> = {
    "gpt-5.6": GPT_5_6_REASONING,
    "gpt-5.6-sol": GPT_5_6_REASONING,
    "gpt-5.6-terra": GPT_5_6_REASONING,
    "gpt-5.6-luna": GPT_5_6_REASONING,
    "gpt-6": GPT_6_ASTRA_REASONING,
    "gpt-6-astra": GPT_6_ASTRA_REASONING,
    "gpt-6-sol": GPT_6_SOL_LUNA_REASONING,
    "gpt-6-luna": GPT_6_SOL_LUNA_REASONING
};

export function getOpenAiModelCapabilities(modelId: string): OpenAiModelCapabilities | undefined {
    return Object.hasOwn(OPENAI_MODEL_CAPABILITIES, modelId) ? OPENAI_MODEL_CAPABILITIES[modelId] : undefined;
}

/** Update capabilities without changing saved selection, pricing, or context. */
export function enrichOpenAiModel<T extends { id: string }>(model: T): T & Partial<{
    supportedReasoningEfforts: string[];
    defaultReasoningEffort: string;
}> {
    const capabilities = getOpenAiModelCapabilities(model.id);
    if (!capabilities) return model;
    return {
        ...model,
        supportedReasoningEfforts: [...capabilities.supportedReasoningEfforts],
        defaultReasoningEffort: capabilities.defaultReasoningEffort
    };
}

export function enrichOpenAiModels<T extends { id: string }>(models: T[]) {
    return models.map(enrichOpenAiModel);
}
