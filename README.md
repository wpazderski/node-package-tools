# @wpazderski/node-package-tools

Common Node.js package tools

## Installation and usage

_Make sure you have `pnpm` installed - it's required to run these tools._

Start by installing this package, for example with `pnpm`:

```sh
pnpm i -D @wpazderski/node-package-tools
```

Create a configuration file (see [Configuration](#configuration) section).

Then you can run provided tools e.g.:

```sh
pnpm exec check-licenses
```

## Tools

### `check-licenses`

Runs `pnpm licenses ls` to list licenses used by package dependencies and then ensures that all licenses are allowed (see [Configuration](#configuration) section).

Accepts one optional argument - custom config file name.

### `check-outdated-packages`

Runs `pnpm outdated -r` to list all packages that are outdated and then ensures that all packages are up-to-date or are allowed to be outdated (see [Configuration](#configuration) section).

Accepts one optional argument - custom config file name.

## Configuration

### Configuration file path

First existing file is used:

- custom (provided as a script argument),
- `package.config.ts`,
- `package.config.js`,
- `configs/package.config.ts`,
- `configs/package.config.js`.

File paths are relative to the current working directory.

If no configuration file exists, an error is thrown.

### Configuration file example (TypeScript)

```ts
import type { NodePackageToolsConfig } from "@wpazderski/node-package-tools";

const config: NodePackageToolsConfig = {
    licenses: {
        allowedLicenses: [
            "0BSD",
            "Apache-2.0",
            "Artistic-2.0",
            "BlueOak-1.0.0",
            "BSD-2-Clause",
            "BSD-3-Clause",
            "CC-BY-3.0",
            "CC-BY-4.0",
            "CC0-1.0",
            "ISC",
            "LGPL-3.0-or-later",
            "MIT",
            "MPL-2.0",
            "OFL-1.1",
            "Python-2.0",
            "Unlicense",
            "WTFPL",
        ],
        allowedLicenseContentPrefixes: ["The MIT License (MIT)\n"],
        allowedPackages: [
            {
                name: "lorem-ipsum",
                versions: ["14.0.1"],
                reason: 'Uses BSD-3-Clause, but it\'s recognized as "BSD" license because of the way it is defined in package.json',
                shouldWarn: false,
            },
        ],
    },
    outdatedPackages: {
        allowedPackages: [
            {
                name: "another-package",
                versions: ["22.15.29"],
                reason: "Project depends on features removed in v23.*",
                shouldWarn: true,
            },
        ],
    },
};

export default config;
```

### Configuration file types

```ts
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

/**
 * Configuration for checking outdated packages ("check-outdated-packages" tool).
 */
export interface OutdatedPackagesConfig {
    /**
     * An array of allowed outdated packages.
     */
    allowedPackages?: AllowedPackage[] | undefined;
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
```

### Predefined configs

You can use predefined configs:

```ts
import { type NodePackageToolsConfig, configs } from "@wpazderski/node-package-tools";

const config: NodePackageToolsConfig = configs.base.v1;

export default config;
```

- Each config (e.g. `configs.base`) contains configs named `vX` where `X` is a number (version).
- There is also `latest` config (e.g. `configs.base.latest`) that is equal to the most recent `vX` config.
- If you want to keep the config unchanged, use only `vX` configs.

### Merging configs

You can merge configs using `mergeConfigs()` function:

```ts
import { type NodePackageToolsConfig, configs, mergeConfigs } from "@wpazderski/node-package-tools";

const config: NodePackageToolsConfig = mergeConfigs(configs.base.latest, {
    licenses: {
        allowedLicenses: ["LoremIpsum"],
        allowedPackages: [
            {
                name: "lorem-ipsum",
                versions: ["14.0.1"],
                reason: 'Uses BSD-3-Clause, but it\'s recognized as "BSD" license because of the way it is defined in package.json',
                shouldWarn: false,
            },
        ],
    },
    outdatedPackages: {
        allowedPackages: [
            {
                name: "another-package",
                versions: ["22.15.29"],
                reason: "Project depends on features removed in v23.*",
                shouldWarn: true,
            },
        ],
    },
});

export default config;
```

- `mergeConfigs()` accepts unlimited number of configs as arguments.
- Following arrays will be merged without duplicates:
    - `licenses.allowedLicenses`,
    - `licenses.allowedLicenseContentPrefixes`.
- Following arrays will be merged without checking for duplicates:
    - `licenses.allowedPackages`,
    - `outdatedPackages.allowedPackages`.

## Related projects

See [https://pazderski.dev/projects/](https://pazderski.dev/projects/) for other projects that provide various configs, utils, tools and examples.
