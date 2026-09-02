import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const VALIDATED_OPENAI_VERSION = "4.0.42";
export const PATCHED_OPENAI_TGZ = "https://github.com/KONTAYUN/ai/releases/download/openai-web-search-replay-v4.0.42-r2/ai-sdk-openai-4.0.42-web-search-replay-r2.tgz";
export const PATCHED_OPENAI_SHA256 = "c1ff615dd37ea06101773f0f848e2a06072fd505336e70d905bd54f6d1a3df19";
const PATCHED_OPENAI_INTEGRITY = "sha512-1mBKWV6qz2tenJGZ9YltJoVS2voOyty+R7KfThe2HZgA/BuO+GcSO5W7Me9+E3KRLG9f4YpQVMjCyS34pmJt5A==";

const OPENAI_PACKAGE = "@ai-sdk/openai";
const MANIFEST_PATHS = [
    "apps/server/package.json",
    "packages/trilium-core/package.json"
];

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(raw, label) {
    try {
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed)) {
            throw new Error("the root value is not an object");
        }
        return parsed;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to parse ${label}: ${reason}`);
    }
}

function dependencyVersion(manifest) {
    return isRecord(manifest.dependencies)
        ? manifest.dependencies[OPENAI_PACKAGE]
        : undefined;
}

function printableVersion(value) {
    if (value === undefined) {
        return "<missing>";
    }
    return typeof value === "string" ? value : JSON.stringify(value);
}

function readGitManifest(root, ref, manifestPath) {
    let raw;
    try {
        raw = execFileSync("git", [ "show", `${ref}:${manifestPath}` ], {
            cwd: root,
            encoding: "utf8",
            stdio: [ "ignore", "pipe", "pipe" ]
        });
    } catch (error) {
        const stderr = error && typeof error === "object" && "stderr" in error
            ? String(error.stderr).trim()
            : "";
        throw new Error(
            `Unable to read upstream manifest ${manifestPath} from ${ref}.${stderr ? ` ${stderr}` : ""}`
        );
    }
    return parseJson(raw, `${ref}:${manifestPath}`);
}

export function checkUpstreamVersion(ref, root = process.cwd()) {
    if (!ref) {
        throw new Error("An upstream Git ref is required.");
    }

    const versions = MANIFEST_PATHS.map((manifestPath) => ({
        manifestPath,
        version: dependencyVersion(readGitManifest(root, ref, manifestPath))
    }));
    const mismatches = versions.filter(({ version }) => version !== VALIDATED_OPENAI_VERSION);

    if (mismatches.length > 0) {
        const distinctVersions = [ ...new Set(mismatches.map(({ version }) => printableVersion(version))) ];
        const changedTo = distinctVersions.join(", ");

        const errorLines = [
            `Upstream @ai-sdk/openai changed from validated version ${VALIDATED_OPENAI_VERSION} to ${changedTo}.`,
            "Patched SDK compatibility requires manual review.",
            "Automatic release aborted."
        ];
        if (mismatches.length !== versions.length) {
            errorLines.splice(1, 0, `Affected upstream manifests: ${mismatches
                .map(({ manifestPath, version }) => `${manifestPath}=${printableVersion(version)}`)
                .join(", ")}.`);
        }
        throw new Error(errorLines.join("\n"));
    }

    console.log(`Upstream @ai-sdk/openai remains at validated version ${VALIDATED_OPENAI_VERSION} (${ref}).`);
}

function formatJsonLike(raw, value) {
    const indentation = raw.match(/\r?\n([\t ]+)\S/)?.[1] ?? "  ";
    const trailingNewline = raw.endsWith("\r\n")
        ? "\r\n"
        : raw.endsWith("\n")
            ? "\n"
            : "";
    return `${JSON.stringify(value, null, indentation)}${trailingNewline}`;
}

export function restorePatchedSdk(root = process.cwd()) {
    const changed: string[] = [];

    for (const manifestPath of MANIFEST_PATHS) {
        const absolutePath = join(root, manifestPath);
        const raw = readFileSync(absolutePath, "utf8");
        const manifest = parseJson(raw, manifestPath);
        if (!isRecord(manifest.dependencies) || !(OPENAI_PACKAGE in manifest.dependencies)) {
            throw new Error(`${manifestPath} does not declare ${OPENAI_PACKAGE} in dependencies.`);
        }
        if (manifest.dependencies[OPENAI_PACKAGE] === PATCHED_OPENAI_TGZ) {
            continue;
        }

        manifest.dependencies[OPENAI_PACKAGE] = PATCHED_OPENAI_TGZ;
        writeFileSync(absolutePath, formatJsonLike(raw, manifest));
        changed.push(manifestPath);
    }

    console.log(changed.length > 0
        ? `Restored patched @ai-sdk/openai in: ${changed.join(", ")}`
        : "Both manifests already reference the validated patched @ai-sdk/openai archive.");
}

async function loadLockfile(root) {
    const yamlModule = await import("js-yaml");
    const loadYaml = yamlModule.load ?? yamlModule.default?.load;
    if (typeof loadYaml !== "function") {
        throw new Error("Unable to load the js-yaml parser.");
    }

    const lockfilePath = join(root, "pnpm-lock.yaml");
    const parsed = loadYaml(readFileSync(lockfilePath, "utf8"));
    if (!isRecord(parsed)) {
        throw new Error("pnpm-lock.yaml does not contain a YAML object.");
    }
    return parsed;
}

function verifyManifestReferences(root) {
    for (const manifestPath of MANIFEST_PATHS) {
        const manifest = parseJson(readFileSync(join(root, manifestPath), "utf8"), manifestPath);
        const version = dependencyVersion(manifest);
        if (version !== PATCHED_OPENAI_TGZ) {
            throw new Error(`${manifestPath} must reference ${PATCHED_OPENAI_TGZ}; found ${printableVersion(version)}.`);
        }
    }
}

function versionResolvesToPatchedTgz(value) {
    return typeof value === "string"
        && (value === PATCHED_OPENAI_TGZ || value.startsWith(`${PATCHED_OPENAI_TGZ}(`));
}

function verifyLockfileReferences(lockfile) {
    if (!isRecord(lockfile.importers)) {
        throw new Error("pnpm-lock.yaml is missing importers.");
    }

    for (const manifestPath of MANIFEST_PATHS) {
        const importerPath = dirname(manifestPath).replaceAll("\\", "/");
        const importer = lockfile.importers[importerPath];
        const dependency = isRecord(importer) && isRecord(importer.dependencies)
            ? importer.dependencies[OPENAI_PACKAGE]
            : undefined;
        if (!isRecord(dependency)
            || dependency.specifier !== PATCHED_OPENAI_TGZ
            || !versionResolvesToPatchedTgz(dependency.version)) {
            throw new Error(`pnpm-lock.yaml importer ${importerPath} does not resolve ${OPENAI_PACKAGE} to the patched archive.`);
        }
    }

    if (!isRecord(lockfile.packages)) {
        throw new Error("pnpm-lock.yaml is missing packages.");
    }
    const openAiPackageKeys = Object.keys(lockfile.packages)
        .filter(key => key.startsWith(`${OPENAI_PACKAGE}@`));
    const expectedPackageKey = `${OPENAI_PACKAGE}@${PATCHED_OPENAI_TGZ}`;
    if (openAiPackageKeys.length !== 1 || openAiPackageKeys[0] !== expectedPackageKey) {
        throw new Error(
            `pnpm-lock.yaml must contain exactly one patched ${OPENAI_PACKAGE} package resolution; found: ${openAiPackageKeys.join(", ") || "<none>"}.`
        );
    }

    const packageEntry = lockfile.packages[expectedPackageKey];
    if (!isRecord(packageEntry)
        || packageEntry.version !== VALIDATED_OPENAI_VERSION
        || !isRecord(packageEntry.resolution)
        || packageEntry.resolution.tarball !== PATCHED_OPENAI_TGZ
        || packageEntry.resolution.integrity !== PATCHED_OPENAI_INTEGRITY) {
        throw new Error(`pnpm-lock.yaml package resolution for ${OPENAI_PACKAGE} is not the validated patched archive.`);
    }

    if (!isRecord(lockfile.snapshots)) {
        throw new Error("pnpm-lock.yaml is missing snapshots.");
    }
    const openAiSnapshotKeys = Object.keys(lockfile.snapshots)
        .filter(key => key.startsWith(`${OPENAI_PACKAGE}@`));
    if (openAiSnapshotKeys.length === 0
        || openAiSnapshotKeys.some(key => !key.startsWith(expectedPackageKey))) {
        throw new Error(
            `pnpm-lock.yaml contains an unpatched ${OPENAI_PACKAGE} snapshot: ${openAiSnapshotKeys.join(", ") || "<none>"}.`
        );
    }
}

function verifyInstalledPackages(root) {
    const installedRoots: string[] = [];

    for (const manifestPath of MANIFEST_PATHS) {
        const manifestFile = join(root, manifestPath);
        const requireFromWorkspace = createRequire(manifestFile);
        let installedManifestPath;
        try {
            installedManifestPath = requireFromWorkspace.resolve(`${OPENAI_PACKAGE}/package.json`);
        } catch {
            throw new Error(`${manifestPath} cannot resolve an installed ${OPENAI_PACKAGE}.`);
        }

        const installedManifest = parseJson(
            readFileSync(installedManifestPath, "utf8"),
            installedManifestPath
        );
        if (installedManifest.name !== OPENAI_PACKAGE
            || installedManifest.version !== VALIDATED_OPENAI_VERSION) {
            throw new Error(
                `${manifestPath} resolves an unexpected installed ${OPENAI_PACKAGE} package (${printableVersion(installedManifest.name)}@${printableVersion(installedManifest.version)}).`
            );
        }
        installedRoots.push(realpathSync(installedManifestPath));
    }

    if (new Set(installedRoots).size !== 1) {
        throw new Error(
            `The two workspaces resolve different installed ${OPENAI_PACKAGE} instances: ${installedRoots.join(", ")}.`
        );
    }
}

export async function verifyPatchedSdk(root = process.cwd()) {
    verifyManifestReferences(root);
    verifyLockfileReferences(await loadLockfile(root));
    verifyInstalledPackages(root);
    console.log(`Validated one patched ${OPENAI_PACKAGE}@${VALIDATED_OPENAI_VERSION} installation.`);
}

export async function verifyPatchedTarball() {
    let response;
    try {
        response = await fetch(PATCHED_OPENAI_TGZ);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to download the patched ${OPENAI_PACKAGE} archive: ${reason}`);
    }
    if (!response.ok) {
        throw new Error(
            `Unable to download the patched ${OPENAI_PACKAGE} archive: HTTP ${response.status}.`
        );
    }

    const archive = Buffer.from(await response.arrayBuffer());
    const actualSha256 = createHash("sha256").update(archive).digest("hex");
    if (actualSha256 !== PATCHED_OPENAI_SHA256) {
        throw new Error(
            `Patched ${OPENAI_PACKAGE} archive SHA-256 mismatch: expected ${PATCHED_OPENAI_SHA256}, found ${actualSha256}.`
        );
    }
    console.log(`Patched ${OPENAI_PACKAGE} archive SHA-256 verified: ${actualSha256}`);
}

function usage() {
    return "Usage: node --experimental-strip-types scripts/openai-patch-guard.mts <check-upstream REF|restore|verify|verify-tarball>";
}

async function main() {
    const [ command, ...args ] = process.argv.slice(2);
    switch (command) {
        case "check-upstream":
            if (args.length !== 1) throw new Error(usage());
            checkUpstreamVersion(args[0]);
            break;
        case "restore":
            if (args.length !== 0) throw new Error(usage());
            restorePatchedSdk();
            break;
        case "verify":
            if (args.length !== 0) throw new Error(usage());
            await verifyPatchedSdk();
            break;
        case "verify-tarball":
            if (args.length !== 0) throw new Error(usage());
            await verifyPatchedTarball();
            break;
        default:
            throw new Error(usage());
    }
}

const isMain = process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
