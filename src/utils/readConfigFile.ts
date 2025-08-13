import * as fs from "fs";
import type { NodePackageToolsConfig } from "../types.ts";
import { getAbsoluteFilePath } from "./getAbsoluteFilePath.ts";

export const defaultConfigFilePaths: string[] = ["package.config.ts", "package.config.js", "configs/package.config.ts", "configs/package.config.js"];

export async function readConfigFile(): Promise<NodePackageToolsConfig> {
    const customFilePath = process.argv[2];
    if (typeof customFilePath === "string" && customFilePath.length > 0) {
        return await readConfigFileCore(getAbsoluteFilePath(customFilePath));
    }
    for (const filePath of defaultConfigFilePaths) {
        const absoluteFilePath = getAbsoluteFilePath(filePath);
        if (fs.existsSync(absoluteFilePath)) {
            return await readConfigFileCore(absoluteFilePath);
        }
    }
    // eslint-disable-next-line no-console
    console.error(
        `No configuration file found. Please provide a valid config file path as the first argument or ensure one of the following files exists in the current directory: ${defaultConfigFilePaths.join(", ")}`,
    );
    process.exit(1);
}

async function readConfigFileCore(filePath: string): Promise<NodePackageToolsConfig> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const config = (await import(filePath)).default as NodePackageToolsConfig;
        return config;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error reading config file "${filePath}":`, error);
        process.exit(1);
    }
}
