import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT_PATH = fileURLToPath(new URL("./openai-patch-guard.mts", import.meta.url));
const PATCHED_TGZ = "https://github.com/KONTAYUN/ai/releases/download/openai-web-search-replay-v4.0.42-r2/ai-sdk-openai-4.0.42-web-search-replay-r2.tgz";
const MANIFEST_PATHS = [
    "apps/server/package.json",
    "packages/trilium-core/package.json"
];

let repositoryRoot: string;

function git(...args: string[]) {
    return execFileSync("git", args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: [ "ignore", "pipe", "pipe" ]
    });
}

function writeManifests(version: string) {
    for (const manifestPath of MANIFEST_PATHS) {
        const absolutePath = join(repositoryRoot, manifestPath);
        mkdirSync(join(absolutePath, ".."), { recursive: true });
        writeFileSync(absolutePath, JSON.stringify({
            name: manifestPath,
            dependencies: { "@ai-sdk/openai": version },
            preserved: { value: true }
        }, null, 2));
    }
}

function runGuard(command: string, ...args: string[]) {
    return spawnSync(process.execPath, [ "--experimental-strip-types", SCRIPT_PATH, command, ...args ], {
        cwd: repositoryRoot,
        encoding: "utf8"
    });
}

beforeAll(() => {
    repositoryRoot = mkdtempSync(join(tmpdir(), "trilium-openai-patch-guard-"));
    git("init", "--quiet");
    git("config", "user.name", "Patch Guard Test");
    git("config", "user.email", "patch-guard@example.invalid");

    writeManifests("4.0.42");
    git("add", ".");
    git("commit", "--quiet", "-m", "validated upstream");
    git("tag", "validated");

    writeManifests("4.0.43");
    git("add", ".");
    git("commit", "--quiet", "-m", "changed upstream");
    git("tag", "changed");
});

afterAll(() => {
    rmSync(repositoryRoot, { recursive: true, force: true });
});

describe("OpenAI patched SDK upstream guard", () => {
    it("accepts an upstream ref that still declares 4.0.42", () => {
        const result = runGuard("check-upstream", "validated");

        expect(result.status).toBe(0);
        expect(result.stdout).toContain(
            "Upstream @ai-sdk/openai remains at validated version 4.0.42"
        );
    });

    it("blocks an upstream ref that changed the SDK version", () => {
        const result = runGuard("check-upstream", "changed");
        const stderr = result.stderr.replaceAll("\r\n", "\n");

        expect(result.status).toBe(1);
        expect(stderr).toContain([
            "Upstream @ai-sdk/openai changed from validated version 4.0.42 to 4.0.43.",
            "Patched SDK compatibility requires manual review.",
            "Automatic release aborted."
        ].join("\n"));
    });

    it("restores the patched archive without losing other manifest data", () => {
        const result = runGuard("restore");

        expect(result.status).toBe(0);
        for (const manifestPath of MANIFEST_PATHS) {
            const manifest = JSON.parse(readFileSync(join(repositoryRoot, manifestPath), "utf8"));
            expect(manifest.dependencies["@ai-sdk/openai"]).toBe(PATCHED_TGZ);
            expect(manifest.preserved).toEqual({ value: true });
        }
    });

    it("is idempotent when the patched archive is already restored", () => {
        expect(runGuard("restore").status).toBe(0);
        const before = MANIFEST_PATHS.map(manifestPath =>
            readFileSync(join(repositoryRoot, manifestPath), "utf8"));
        const result = runGuard("restore");

        expect(result.status).toBe(0);
        expect(result.stdout).toContain("Both manifests already reference");
        expect(MANIFEST_PATHS.map(manifestPath =>
            readFileSync(join(repositoryRoot, manifestPath), "utf8"))).toEqual(before);
    });
});
