import type { AllowedPackage, PnpmPackage, PnpmPackageGroups } from "../types.ts";
import { checkPackageAgainstAllowList } from "../utils/checkPackageAgainstAllowList.ts";
import { execAsync } from "../utils/execAsync.ts";
import { readConfigFile } from "../utils/readConfigFile.ts";
import { SpdxLicense } from "../utils/SpdxLicense.ts";
import { StdOut } from "../utils/StdOut.ts";
import { isPackageAllowedDueToLicenseContents } from "./isPackageAllowedDueToLicenseContents.ts";

const config = await readConfigFile();
const allowedLicenses: string[] = config.licenses?.allowedLicenses ?? [];
const allowedPackages: AllowedPackage[] = config.licenses?.allowedPackages ?? [];
const allowedLicenseContentPrefixes: string[] = config.licenses?.allowedLicenseContentPrefixes ?? [];

const { stdout } = await execAsync("pnpm licenses ls --json");

const allPackageGroups: PnpmPackageGroups = JSON.parse(stdout) as PnpmPackageGroups;
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
