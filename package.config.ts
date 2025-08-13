import { type NodePackageToolsConfig, configs, mergeConfigs } from "./src/exportsIndex.ts";

const config: NodePackageToolsConfig = mergeConfigs(configs.base.latest, {
    outdatedPackages: {
        allowedPackages: [
            {
                name: "@wpazderski/eslint-config",
                shouldWarn: true,
            },
            {
                name: "@wpazderski/prettier-config",
                shouldWarn: true,
            },
            {
                name: "@wpazderski/typescript-config",
                shouldWarn: true,
            },
        ],
    },
});

// eslint-disable-next-line import/no-default-export
export default config;
