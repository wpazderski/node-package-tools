import * as nodePath from "path";

export function getAbsoluteFilePath(relativeOrAbsoluteFilePath: string): string {
    return nodePath.isAbsolute(relativeOrAbsoluteFilePath) ? relativeOrAbsoluteFilePath : nodePath.join(process.cwd(), relativeOrAbsoluteFilePath);
}
