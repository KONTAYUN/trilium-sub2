import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkVersionConsistency } from "./check-version-consistency";

const MANIFEST_PATHS = [
    "package.json",
    "apps/server/package.json",
    "apps/client/package.json",
    "apps/desktop/package.json",
    "packages/commons/package.json"
];

let fixtureRoot: string | undefined;

function writeManifests(version: string) {
    fixtureRoot = mkdtempSync(join(tmpdir(), "trilium-version-consistency-"));
    for (const manifestPath of MANIFEST_PATHS) {
        const absolutePath = join(fixtureRoot, manifestPath);
        mkdirSync(join(absolutePath, ".."), { recursive: true });
        writeFileSync(absolutePath, JSON.stringify({ version }));
    }
    return fixtureRoot;
}

afterEach(() => {
    if (fixtureRoot) {
        rmSync(fixtureRoot, { recursive: true, force: true });
        fixtureRoot = undefined;
    }
});

describe("release version consistency", () => {
    it.each([
        [ "v0.105.0", "0.105.0" ],
        [ "v0.105.0-sub2.1", "0.105.0" ],
        [ "v0.105.0-sub2.9", "0.105.0" ]
    ])("accepts %s when manifests use %s", (tag, manifestVersion) => {
        expect(checkVersionConsistency(tag, writeManifests(manifestVersion))).toBe(manifestVersion);
    });

    it.each([
        [ "v0.105.1", "0.105.0", "0.105.1" ],
        [ "v0.106.0-sub2.1", "0.105.0", "0.106.0" ]
    ])("rejects %s when manifests use %s", (tag, manifestVersion, expectedVersion) => {
        expect(() => checkVersionConsistency(tag, writeManifests(manifestVersion)))
            .toThrow(`expected ${expectedVersion}, found ${manifestVersion}`);
    });

    it.each([
        "v0.105.0-sub2.rc1",
        "v0.105.0-sub2",
        "v0.105.0-sub2.x"
    ])("blocks malformed Sub2 tag %s", (tag) => {
        expect(() => checkVersionConsistency(tag, writeManifests("0.105.0")))
            .toThrow(`Invalid Sub2 release tag: ${tag}`);
    });
});
