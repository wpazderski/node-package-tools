import type { LicensesConfig } from "./checkLicenses/types.ts";
import type { OutdatedPackagesConfig } from "./checkOutdatedPackages/types.ts";

export interface PnpmPackage {
    name?: string | undefined;
    version?: string | undefined;
    versions?: string[] | undefined;
    path?: string | undefined;
    license?: string | undefined;
    licenseContents?: string | undefined;
    author?: string | undefined;
    homepage?: string | undefined;
    description?: string | undefined;
}

export type BasicPnpmPackageInfo = Pick<PnpmPackage, "name" | "version" | "versions">;

export type PnpmPackagesGroup = PnpmPackage[];

export type PnpmPackageGroups = Record<string, PnpmPackagesGroup>;

export type RequiredNonNullable<T> = {
    [P in keyof T]-?: NonNullable<T[P]>;
};

/*******************************************************************************
 ***** Types below are exported by this package to be used in config files. ****
 ******************************************************************************/

/**
 * Configuration for node package tools.
 */
export interface NodePackageToolsConfig {
    /**
     * Configuration for checking licenses of packages ("check-licenses" tool).
     */
    licenses?: LicensesConfig | undefined;

    /**
     * Configuration for checking outdated packages ("check-outdated-packages" tool).
     */
    outdatedPackages?: OutdatedPackagesConfig | undefined;
}

/**
 * Definition of a package that is allowed due to special circumstances.
 */
export interface AllowedPackage {
    /**
     * The name of the package.
     */
    name: string;

    /**
     * Version string or an array of version strings that are allowed.
     * If not specified, all versions of the package are allowed.
     * Strings can be exact versions or can follow semver patterns.
     * @see https://www.npmjs.com/package/semver
     */
    versions?: string | string[] | undefined;

    /**
     * A reason why the package is allowed (for informational purposes only).
     */
    reason?: string | undefined;

    /**
     * Whether to print a warning if a matching package is found.
     * This won't affect the exit code of the tool.
     */
    shouldWarn?: boolean | undefined;
}
