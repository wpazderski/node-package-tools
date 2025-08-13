import type { AllowedPackage } from "../types.ts";

export interface PnpmOutdatedPackageDetails {
    current: string;
    latest: string;
    wanted: string;
    isDeprecated: boolean;
    dependencyType: string;
}

export type PnpmOutdatedPackages = Record<string, PnpmOutdatedPackageDetails>;

export interface NotAllowedOutdatedPackage extends PnpmOutdatedPackageDetails {
    name: string;
}

/*******************************************************************************
 ***** Types below are exported by this package to be used in config files. ****
 ******************************************************************************/

/**
 * Configuration for checking outdated packages ("check-outdated-packages" tool).
 */
export interface OutdatedPackagesConfig {
    /**
     * An array of allowed outdated packages.
     */
    allowedPackages?: AllowedPackage[] | undefined;
}
