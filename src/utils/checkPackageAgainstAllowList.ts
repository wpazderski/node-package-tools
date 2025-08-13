import { satisfies } from "semver";
import type { AllowedPackage, BasicPnpmPackageInfo } from "../types.ts";

export interface CheckPackageAgainstAllowListResult {
    isEveryVersionAllowed: boolean;
    matchedAllowedPackages: AllowedPackage[];
}

export function checkPackageAgainstAllowList(pnpmPackage: BasicPnpmPackageInfo, allowedPackages: AllowedPackage[]): CheckPackageAgainstAllowListResult {
    if (pnpmPackage.name === undefined) {
        throw new Error("Package name is undefined");
    }
    if (pnpmPackage.version !== undefined && pnpmPackage.versions !== undefined) {
        throw new Error(`Both "version" and "versions" are defined for package "${pnpmPackage.name}"`);
    }
    const versions: string[] = pnpmPackage.versions ?? (pnpmPackage.version === undefined ? [] : [pnpmPackage.version]);
    if (versions.length === 0) {
        throw new Error(`No version found for package "${pnpmPackage.name}"`);
    }

    const matchedAllowedPackagesSet = new Set<AllowedPackage>();
    let isEveryVersionAllowed = true;

    for (const version of versions) {
        const matchedAllowedPackage = allowedPackages.find((allowedPackage) => allowedPackage.name === pnpmPackage.name && isVersionAllowed(version, allowedPackage.versions));
        if (matchedAllowedPackage) {
            matchedAllowedPackagesSet.add(matchedAllowedPackage);
        } else {
            isEveryVersionAllowed = false;
        }
    }

    return {
        isEveryVersionAllowed: isEveryVersionAllowed,
        matchedAllowedPackages: Array.from(matchedAllowedPackagesSet),
    };
}

function isVersionAllowed(version: string, allowedVersions: string | string[] | undefined): boolean {
    if (allowedVersions === undefined) {
        // Allow all versions if no allowed versions are specified
        return true;
    }

    // Allow if version matches any of the allowed version strings
    const allowedVersionsArr = typeof allowedVersions === "string" ? [allowedVersions] : allowedVersions;
    return allowedVersionsArr.some((allowedVersion) => satisfies(version, allowedVersion));
}
