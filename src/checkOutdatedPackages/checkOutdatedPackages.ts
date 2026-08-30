import type { AllowedPackage } from "../types.ts";
import { checkPackageAgainstAllowList } from "../utils/checkPackageAgainstAllowList.ts";
import { parseJsonFromCommandOutput } from "../utils/parseJsonFromCommandOutput.ts";
import { readConfigFile } from "../utils/readConfigFile.ts";
import { runCommandForJson } from "../utils/runCommandForJson.ts";
import { StdOut } from "../utils/StdOut.ts";
import type { NotAllowedOutdatedPackage, PnpmOutdatedPackages } from "./types.ts";

const config = await readConfigFile();
const allowedOutdatedPackages: AllowedPackage[] = config.outdatedPackages?.allowedPackages ?? [];

// `--use-stderr` moves every diagnostic to stderr, so stdout carries the document and nothing else.
// `WARN GET <registry>/... error (ECONNRESET). Will retry` once landed ahead of the document and made a 14-minute run
// report nothing at all.
//
// `--reporter=silent` was tried first, and it is worse: it DROPS every `ERR_PNPM_*` record from both streams. A run
// against an unreachable registry then printed 0 bytes on each, and the only message a reader got was "printed
// nothing". With `--use-stderr` that same run puts the whole `ERR_PNPM_META_FETCH_FAIL` diagnostic on stderr, and the
// message below quotes it.
const outdatedCommand = "pnpm outdated --format json -r --use-stderr";
// `isNonZeroExitExpected: true`. This command exits 1 when a package IS outdated, which is the ordinary case, and the
// document is on stdout all the same.
const { stdout, stderr } = await runCommandForJson(outdatedCommand, `\`${outdatedCommand}\``, { isNonZeroExitExpected: true });
const allOutdatedPackages: PnpmOutdatedPackages = parseJsonFromCommandOutput(stdout, `\`${outdatedCommand}\``, stderr) as PnpmOutdatedPackages;
const notAllowedOutdatedPackages: NotAllowedOutdatedPackage[] = [];
for (const [packageName, outdatedPackageDetails] of Object.entries(allOutdatedPackages)) {
    const checkPackageResult = checkPackageAgainstAllowList(
        {
            name: packageName,
            version: outdatedPackageDetails.current,
        },
        allowedOutdatedPackages,
    );
    for (const allowedPackage of checkPackageResult.matchedAllowedPackages) {
        if (allowedPackage.shouldWarn === true) {
            StdOut.warn(
                `[check-outdated-packages] Warning - allowed outdated package: ${packageName} (${outdatedPackageDetails.current} -> ${outdatedPackageDetails.latest}; wanted: ${outdatedPackageDetails.wanted}; reason: ${allowedPackage.reason ?? "<none>"})`,
            );
        }
    }
    if (checkPackageResult.isEveryVersionAllowed) {
        continue;
    }
    notAllowedOutdatedPackages.push({
        ...outdatedPackageDetails,
        name: packageName,
    });
}

if (notAllowedOutdatedPackages.length > 0) {
    StdOut.error("[check-outdated-packages] Error - outdated packages found:");
    StdOut.error(notAllowedOutdatedPackages);
    process.exit(1);
}
