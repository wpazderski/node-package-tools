import { createBaseConfig } from "@wpazderski/eslint-config/base.config.js";
import type { ConfigArray } from "@wpazderski/eslint-config/types.js";

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
const baseConfig = createBaseConfig() as ConfigArray;

// A test file is a CATEGORY, so its one relaxation goes here and never in a per-line directive.
// `describe` and `it` of `node:test` each return a promise that the runner owns. Nothing is meant to await them, and
// `void` on every one of them would be noise that hides a real floating promise inside a test body.
//
// It names those two calls rather than turning the rule OFF for the file. The rule is what catches a dropped `await`
// on an assertion, and a case with one asserts nothing at all.
// It is ANNOTATED, and never cast. `as unknown as` accepted `{ file: [...], rulez: {...} }` just as happily, so a typo
// in a key would have turned the block into a silent no-op.
const testFileConfig: ConfigArray[number] = {
    files: ["**/*.test.ts"],
    rules: {
        "@typescript-eslint/no-floating-promises": ["error", { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["describe", "it"] }] }],
    },
};

export default [...baseConfig, testFileConfig] as ConfigArray;
