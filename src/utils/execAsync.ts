import { exec } from "child_process";
import { promisify } from "util";

export const execAsync: typeof exec.__promisify__ = promisify(exec);

/**
 * The output limit for a command this package runs, in bytes.
 *
 * Node's `exec` defaults to 1 MiB, and it does NOT fail cleanly at that limit: it rejects with a TRUNCATED `stdout`.
 * A caller that reads `error.stdout` then gets a half-document, and a parse of one can produce a wrong answer rather
 * than an error. This monorepo's `pnpm licenses ls --json` document is already about 480 KB, which is half of the
 * default, so the limit is not a distant one.
 */
export const maximumCommandOutputBytes: number = 64 * 1024 * 1024;
