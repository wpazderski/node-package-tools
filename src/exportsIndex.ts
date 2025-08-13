export * as configs from "./configs/index.ts";
export type { LicensesConfig } from "./checkLicenses/types.ts";
export type { OutdatedPackagesConfig } from "./checkOutdatedPackages/types.ts";
export { mergeConfigs, mergeLicensesConfig, mergeOutdatedPackagesConfig } from "./utils/mergeConfigs.ts";
export type { AllowedPackage, NodePackageToolsConfig } from "./types.ts";
