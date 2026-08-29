import { t } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getNoteMock, currentTitleMock, upstreamTitleMock, getProviderMock } = vi.hoisted(() => ({
    getNoteMock: vi.fn(),
    currentTitleMock: vi.fn(),
    upstreamTitleMock: vi.fn(),
    getProviderMock: vi.fn()
}));

vi.mock("../../becca/becca.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../becca/becca.js")>();
    return { default: { ...actual.default, getNote: getNoteMock } };
});

vi.mock("../../services/log.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../services/log.js")>();
    return { ...actual, getLog: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) };
});

vi.mock("./index.js", () => ({ getProvider: getProviderMock }));

import { generateChatTitle } from "./chat_title.js";

const provider = {
    name: "openai",
    useCurrentModelForTitle: true,
    generateTitle: vi.fn(),
    generateTitleForCurrentModel: currentTitleMock
} as any;
const upstreamProvider = {
    name: "anthropic",
    generateTitle: upstreamTitleMock
} as any;

/** A note stub that records title assignment + save(). */
function noteStub(title: string) {
    return {
        title,
        save: vi.fn()
    };
}

describe("generateChatTitle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        provider.useCurrentModelForTitle = true;
        getProviderMock.mockReturnValue(upstreamProvider);
    });

    it("renames a note that still has a default 'Chat:' title", async () => {
        // Build a default title dynamically from the translation, not a hardcoded string.
        const note = noteStub(`${t("special_notes.llm_chat_prefix")} 2026-01-01`);
        getNoteMock.mockReturnValue(note);
        currentTitleMock.mockResolvedValue("Tolkien reading order");

        await generateChatTitle("chat1", "How should I read Tolkien?", provider, "gpt-5.6-luna");

        expect(currentTitleMock).toHaveBeenCalledWith("How should I read Tolkien?", "gpt-5.6-luna");
        expect(getProviderMock).not.toHaveBeenCalled();
        expect(note.title).toBe("Tolkien reading order");
        expect(note.save).toHaveBeenCalledOnce();
    });

    it("renames a note whose title is the default 'New note' title", async () => {
        const note = noteStub(t("notes.new-note"));
        getNoteMock.mockReturnValue(note);
        currentTitleMock.mockResolvedValue("Generated title");

        await generateChatTitle("chat2", "first message", provider, "gpt-5.6-luna");
        expect(note.title).toBe("Generated title");
        expect(note.save).toHaveBeenCalledOnce();
    });

    it("does nothing when the note no longer exists", async () => {
        getNoteMock.mockReturnValue(null);
        await generateChatTitle("missing", "hello", provider, "gpt-5.6-luna");
        expect(currentTitleMock).not.toHaveBeenCalled();
    });

    it("leaves a manually renamed note untouched", async () => {
        const note = noteStub("My carefully chosen title");
        getNoteMock.mockReturnValue(note);

        await generateChatTitle("chat3", "hello", provider, "gpt-5.6-luna");
        expect(currentTitleMock).not.toHaveBeenCalled();
        expect(note.save).not.toHaveBeenCalled();
    });

    it("does not rename when the provider returns an empty title", async () => {
        const note = noteStub(t("notes.new-note"));
        getNoteMock.mockReturnValue(note);
        currentTitleMock.mockResolvedValue("");

        await generateChatTitle("chat4", "hello", provider, "gpt-5.6-luna");
        expect(note.title).toBe(t("notes.new-note")); // unchanged
        expect(note.save).not.toHaveBeenCalled();
    });

    it("restores the upstream first-provider title path when the current provider does not opt in", async () => {
        const note = noteStub(t("notes.new-note"));
        getNoteMock.mockReturnValue(note);
        provider.useCurrentModelForTitle = false;
        upstreamTitleMock.mockResolvedValue("Upstream title");

        await generateChatTitle("chat5", "hello", provider, "gpt-5.6-luna");

        expect(currentTitleMock).not.toHaveBeenCalled();
        expect(getProviderMock).toHaveBeenCalledOnce();
        expect(upstreamTitleMock).toHaveBeenCalledWith("hello");
        expect(provider.generateTitle).not.toHaveBeenCalled();
        expect(note.title).toBe("Upstream title");
    });
});
