import type { AllowedPackage, PnpmPackage, PnpmPackageGroups } from "../types.ts";
import { checkPackageAgainstAllowList } from "../utils/checkPackageAgainstAllowList.ts";
import { parseJsonFromCommandOutput } from "../utils/parseJsonFromCommandOutput.ts";
import { readConfigFile } from "../utils/readConfigFile.ts";
import { runCommandForJson } from "../utils/runCommandForJson.ts";
import { SpdxLicense } from "../utils/SpdxLicense.ts";
import { StdOut } from "../utils/StdOut.ts";
import { isPackageAllowedDueToLicenseContents } from "./isPackageAllowedDueToLicenseContents.ts";

const config = await readConfigFile();
const allowedLicenses: string[] = config.licenses?.allowedLicenses ?? [];
const allowedPackages: AllowedPackage[] = config.licenses?.allowedPackages ?? [];
const allowedLicenseContentPrefixes: string[] = config.licenses?.allowedLicenseContentPrefixes ?? [];

// `--use-stderr` moves every diagnostic to stderr, so stdout carries the document and nothing else.
// `--reporter=silent` was tried first, and it is worse: it DROPS every `ERR_PNPM_*` record from both streams, so a
// failed run said only "printed nothing" and the reason was gone.
//
// `maxBuffer` is raised from the 1 MiB default. This monorepo's document is already about 480 KB, and `exec` does not
// fail cleanly at the limit: it rejects with a TRUNCATED `stdout`, which is a half-document that no parse can trust.
//
// `isNonZeroExitExpected: false`, and that is the load-bearing part. `--json` makes pnpm skip its reporter entirely, so
// a FAILURE is printed as `{"error":{...}}` on stdout, which parses. Without the exit-code check that error report came
// back as the package list, and the run died later with `TypeError: pnpmPackages is not iterable`.
const licensesCommand = "pnpm licenses ls --json --use-stderr";
const { stdout, stderr } = await runCommandForJson(licensesCommand, `\`${licensesCommand}\``, { isNonZeroExitExpected: false });

const allPackageGroups: PnpmPackageGroups = parseJsonFromCommandOutput(stdout, `\`${licensesCommand}\``, stderr) as PnpmPackageGroups;
const suspiciousPackages: PnpmPackage[] = [];
for (const [licenseName, pnpmPackages] of Object.entries(allPackageGroups)) {
    const spdxLicense = SpdxLicense.fromString(licenseName);
    if (spdxLicense.isAllowed(allowedLicenses)) {
        continue;
    }
    for (const pnpmPackage of pnpmPackages) {
        const checkPackageResult = checkPackageAgainstAllowList(pnpmPackage, allowedPackages);
        for (const allowedPackage of checkPackageResult.matchedAllowedPackages) {
            if (allowedPackage.shouldWarn === true) {
                const version = pnpmPackage.version ?? pnpmPackage.versions?.[0] ?? "<unknown>";
                StdOut.warn(
                    `[check-licenses] Warning - allowed package: ${pnpmPackage.name ?? "<unknown>"} (version: ${version}; license: ${licenseName}; reason: ${allowedPackage.reason ?? "<none>"})`,
                );
            }
        }
        if (checkPackageResult.isEveryVersionAllowed) {
            continue;
        }
        if (isPackageAllowedDueToLicenseContents(pnpmPackage, allowedLicenseContentPrefixes)) {
            continue;
        }
        suspiciousPackages.push(pnpmPackage);
    }
}

if (suspiciousPackages.length > 0) {
    StdOut.error("[check-licenses] Error - suspicious packages found:");
    StdOut.error(suspiciousPackages);
    process.exit(1);
}
