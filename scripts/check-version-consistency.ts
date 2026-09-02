import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const filesToCheck = [
    'package.json',
    'apps/server/package.json',
    'apps/client/package.json',
    'apps/desktop/package.json',
    'packages/commons/package.json',
]

export function resolveExpectedManifestVersion(releaseVersion: string | undefined) {
    if (!releaseVersion) {
        throw new Error('Expected version argument is missing.');
    }

    const sub2Match = /^v([0-9]+\.[0-9]+\.[0-9]+)-sub2\.[0-9]+$/.exec(releaseVersion);
    if (sub2Match) {
        return sub2Match[1];
    }

    if (releaseVersion.toLowerCase().includes('-sub2')) {
        throw new Error(`Invalid Sub2 release tag: ${releaseVersion}. Expected vX.Y.Z-sub2.N.`);
    }

    return releaseVersion.startsWith("v") ? releaseVersion.substring(1) : releaseVersion;
}

export function checkVersionConsistency(releaseVersion: string | undefined, root = projectRoot) {
    const expectedVersion = resolveExpectedManifestVersion(releaseVersion);

    for (const fileToCheck of filesToCheck) {
        const packageJsonPath = join(root, fileToCheck);
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const version = packageJson.version;
        if (version !== expectedVersion) {
            throw new Error(`Version mismatch in ${fileToCheck}: expected ${expectedVersion}, found ${version}`);
        }
    }

    return expectedVersion;
}

function main() {
    try {
        const expectedVersion = checkVersionConsistency(process.argv[2]);
        console.log('All versions are consistent:', expectedVersion);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

const isMain = process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
    main();
}
