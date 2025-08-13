import type { PnpmPackage } from "../types.ts";
import type { LicensesConfig } from "./types.ts";

export function isPackageAllowedDueToLicenseContents(pnpmPackage: PnpmPackage, allowedLicenseContentPrefixes: LicensesConfig["allowedLicenseContentPrefixes"]): boolean {
    if (pnpmPackage.licenseContents === undefined || allowedLicenseContentPrefixes === undefined) {
        return false;
    }
    const licenseContents = pnpmPackage.licenseContents.trim();

    if (allowedLicenseContentPrefixes.some((prefix) => licenseContents.startsWith(prefix))) {
        return true;
    }

    return false;
}
