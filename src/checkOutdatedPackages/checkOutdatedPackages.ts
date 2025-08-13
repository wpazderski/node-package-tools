import type { AllowedPackage } from "../types.ts";
import { checkPackageAgainstAllowList } from "../utils/checkPackageAgainstAllowList.ts";
import { execAsync } from "../utils/execAsync.ts";
import { readConfigFile } from "../utils/readConfigFile.ts";
import { StdOut } from "../utils/StdOut.ts";
import type { NotAllowedOutdatedPackage, PnpmOutdatedPackages } from "./types.ts";

const config = await readConfigFile();
const allowedOutdatedPackages: AllowedPackage[] = config.outdatedPackages?.allowedPackages ?? [];

let stdout: string;
try {
    stdout = (await execAsync("pnpm outdated --format json -r")).stdout;
} catch (error) {
    if (!(error instanceof Error) || !("stdout" in error) || typeof error.stdout !== "string") {
        throw error;
    }
    stdout = error.stdout;
}
const allOutdatedPackages: PnpmOutdatedPackages = JSON.parse(stdout) as PnpmOutdatedPackages;
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
