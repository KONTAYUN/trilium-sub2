import becca from "../../becca/becca.js";
import { getLog } from "../../services/log.js";
import { t } from "i18next";

import { getProvider } from "./index.js";
import type { LlmProvider } from "./types.js";

/** Default title prefixes that indicate the note hasn't been manually renamed. */
function hasDefaultTitle(title: string): boolean {
    // "Chat: <timestamp>" from sidebar/API-created chats
    const chatPrefix = t("special_notes.llm_chat_prefix");
    // "New note" from manually created chats
    const newNoteTitle = t("notes.new-note");

    return title.startsWith(chatPrefix) || title === newNoteTitle;
}

/**
 * Generate a short descriptive title for a chat note based on the first user message,
 * then rename the note. Only renames if the note still has a default title.
 */
export async function generateChatTitle(
    chatNoteId: string,
    firstMessage: string,
    currentProvider: LlmProvider,
    modelId: string
): Promise<void> {
    const log = getLog();

    const note = becca.getNote(chatNoteId);
    if (!note) {
        log.info(`Not naming chat ${chatNoteId}: no such note.`);
        return;
    }

    // Every way out of here is silent from the user's side — the chat keeps the
    // timestamp it was created with — so each one says which it was.
    if (!hasDefaultTitle(note.title)) {
        log.info(`Not naming chat note ${chatNoteId}: "${note.title}" is neither `
            + `"${t("special_notes.llm_chat_prefix")} …" nor "${t("notes.new-note")}", so it was named deliberately.`);
        return;
    }

    // Stateless OpenAI opts into the current model. Every other mode deliberately
    // falls through to v0.105.0's upstream behavior: whichever provider is first.
    const currentModelTitleGenerator = currentProvider.useCurrentModelForTitle
        ? currentProvider.generateTitleForCurrentModel
        : undefined;
    const provider = currentModelTitleGenerator ? currentProvider : getProvider();
    log.info(currentModelTitleGenerator
        ? `Naming chat note ${chatNoteId} with ${provider.name}/${modelId}.`
        : `Naming chat note ${chatNoteId} with the ${provider.name} provider.`);
    const title = currentModelTitleGenerator
        ? await currentModelTitleGenerator.call(currentProvider, firstMessage, modelId)
        : await provider.generateTitle(firstMessage);

    if (!title) {
        log.info(`Not naming chat note ${chatNoteId}: the ${provider.name} provider returned an empty title.`);
        return;
    }

    note.title = title;
    note.save();
    log.info(`Auto-renamed chat note ${chatNoteId} to "${title}"`);
}
