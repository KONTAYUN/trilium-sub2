import type { LlmModelInfo } from "@triliumnext/commons";

export type ReasoningControl = "effort" | "extended-thinking" | "hidden";

/** Choose what occupies the brain-icon slot for the active model. */
export function reasoningControlForModel(model: LlmModelInfo | undefined): ReasoningControl {
    if (model?.provider !== "openai") {
        return "extended-thinking";
    }
    return model.supportedReasoningEfforts?.length ? "effort" : "hidden";
}
