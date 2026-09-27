import "./ReasoningEffortDropdown.css";

import type { LlmModelInfo, LlmReasoningEffort } from "@triliumnext/commons";

import { t } from "../../../services/i18n.js";
import Dropdown from "../../react/Dropdown.js";
import { FormListHeader, FormListItem } from "../../react/FormList.js";

/**
 * The reasoning effort picker of the chat input bar, for a model that lists
 * `reasoningEfforts`; such a model has no extended thinking switch. It stands
 * beside the model picker and shares its combobox styling.
 */
export default function ReasoningEffortDropdown({ model, value, onChange, disabled, inSidebar }: {
    model: LlmModelInfo;
    /** The chat's chosen level; undefined means the model's default. */
    value: LlmReasoningEffort | undefined;
    onChange: (effort: LlmReasoningEffort) => void;
    disabled?: boolean;
    inSidebar?: boolean;
}) {
    const effective = effectiveReasoningEffort(model, value);
    const label = t(`llm_chat.reasoning_effort_levels.${effective}`);
    const title = t("llm_chat.reasoning_effort_title", { level: label });

    return (
        <Dropdown
            // The active model can resolve its default asynchronously. Remounting on the
            // translated title keeps Bootstrap's tooltip metadata in sync with that change.
            key={title}
            title={title}
            titlePosition="top"
            iconAction
            hideToggleArrow
            noSelectButtonStyle
            buttonClassName="llm-chat-capability llm-chat-reasoning-effort active bx bx-brain"
            buttonProps={{ "aria-label": title }}
            className="llm-chat-reasoning-effort"
            dropdownContainerClassName="llm-chat-reasoning-effort-menu"
            disabled={disabled}
            // A few items, so the menu never scrolls and keeps the working backdrop blur.
            noDropdownListStyle
            // Same reason as the model selector: the sidebar clips an unportaled menu.
            portalToBody={inSidebar}
            dropdownOptions={inSidebar ? { popperConfig: { strategy: "fixed" } } : undefined}
        >
            <FormListHeader text={t("llm_chat.reasoning_effort")} />
            {(model.reasoningEfforts ?? []).map(level => (
                <FormListItem key={level} checked={level === effective} onClick={() => onChange(level)}>
                    {t(`llm_chat.reasoning_effort_levels.${level}`)}
                </FormListItem>
            ))}
        </Dropdown>
    );
}

/** The level a turn runs at: the chat's choice where the model has it, else the model's default, else its strongest. */
export function effectiveReasoningEffort(model: LlmModelInfo, value: LlmReasoningEffort | undefined): LlmReasoningEffort {
    const levels = model.reasoningEfforts ?? [];
    if (value && levels.includes(value)) {
        return value;
    }
    return model.defaultReasoningEffort ?? levels[levels.length - 1] ?? "high";
}
