/*******************************************************************************
 ***** Types below are exported by this package to be used in config files. ****
 ******************************************************************************/

import type { AllowedPackage } from "../types.ts";

/**
 * Configuration for checking licenses of packages ("check-licenses" tool).
 */
export interface LicensesConfig {
    /**
     * An array of allowed licenses.
     */
    allowedLicenses?: string[] | undefined;

    /**
     * An array of allowed packages.
     */
    allowedPackages?: AllowedPackage[] | undefined;

    /**
     * An array of allowed license content prefixes.
     * These prefixes are used to check "licenseContents" field of npm packages.
     */
    allowedLicenseContentPrefixes?: string[] | undefined;
}
