import type { LicensesConfig, OutdatedPackagesConfig } from "../exportsIndex.ts";
import type { NodePackageToolsConfig, RequiredNonNullable } from "../types.ts";

export function mergeConfigs(...configs: NodePackageToolsConfig[]): NodePackageToolsConfig {
    const mergedConfig: RequiredNonNullable<NodePackageToolsConfig> = {
        licenses: mergeLicensesConfig(...configs.map((config) => config.licenses ?? {})),
        outdatedPackages: mergeOutdatedPackagesConfig(...configs.map((config) => config.outdatedPackages ?? {})),
    };

    return mergedConfig;
}

export function mergeLicensesConfig(...configs: LicensesConfig[]): LicensesConfig {
    const mergedConfig: RequiredNonNullable<LicensesConfig> = {
        allowedLicenseContentPrefixes: [],
        allowedLicenses: [],
        allowedPackages: [],
    };

    for (const config of configs) {
        if (config.allowedLicenseContentPrefixes !== undefined) {
            mergedConfig.allowedLicenseContentPrefixes = Array.from(new Set<string>([...mergedConfig.allowedLicenseContentPrefixes, ...config.allowedLicenseContentPrefixes]));
        }
        if (config.allowedLicenses !== undefined) {
            mergedConfig.allowedLicenses = Array.from(new Set<string>([...mergedConfig.allowedLicenses, ...config.allowedLicenses]));
        }
        if (config.allowedPackages !== undefined) {
            mergedConfig.allowedPackages.push(...config.allowedPackages);
        }
    }

    return mergedConfig;
}

export function mergeOutdatedPackagesConfig(...configs: OutdatedPackagesConfig[]): OutdatedPackagesConfig {
    const mergedConfig: RequiredNonNullable<OutdatedPackagesConfig> = {
        allowedPackages: [],
    };

    for (const config of configs) {
        if (config.allowedPackages !== undefined) {
            mergedConfig.allowedPackages.push(...config.allowedPackages);
        }
    }

    return mergedConfig;
}
