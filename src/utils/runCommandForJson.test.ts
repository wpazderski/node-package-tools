import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commandTimeoutMs, runCommandForJson } from "./runCommandForJson.ts";

// This module had NO test, and four defects lived in it.
//
// The worst one: `pnpm licenses ls --json` makes pnpm skip its reporter entirely, so a FAILURE is printed as
// `{"error":{...}}` on stdout, which parses. The error report came back as the package list, and the run died later
// with `TypeError: pnpmPackages is not iterable`, naming neither the command nor the reason.
// The exit code is the only thing that tells a report of failure from a report of licences.

/**
 * Builds a shell command that writes to each stream and exits with a chosen code.
 *
 * @param output What to write to the standard output.
 * @param diagnostics What to write to the standard error.
 * @param exitCode The code to exit with.
 * @returns The command line.
 */
function fakeCommand(output: string, diagnostics: string, exitCode: number): string {
    const script = `process.stdout.write(${JSON.stringify(output)}); process.stderr.write(${JSON.stringify(diagnostics)}); process.exit(${String(exitCode)});`;
    return `node -e ${JSON.stringify(script)}`;
}

describe("runCommandForJson and the exit code", () => {
    it("returns both streams for a command that succeeds", async () => {
        const result = await runCommandForJson(fakeCommand('{"a":1}', "", 0), "x", { isNonZeroExitExpected: false });

        assert.equal(result.stdout, '{"a":1}');
        assert.equal(result.exitCode, 0);
        assert.equal(result.signal, null);
    });

    // `pnpm outdated` exits 1 when a package IS outdated, and the document is on stdout all the same.
    it("keeps the document when a non-zero exit is the ORDINARY answer", async () => {
        const result = await runCommandForJson(fakeCommand('{"pkg":{"current":"1.0.0"}}', "", 1), "x", { isNonZeroExitExpected: true });

        assert.equal(result.stdout, '{"pkg":{"current":"1.0.0"}}');
        assert.equal(result.exitCode, 1);
    });

    // THE case this module exists for. The output is valid JSON, so nothing downstream could have questioned it.
    it("refuses a failure whose stdout is a valid JSON error report", async () => {
        const errorReport = '{"error":{"code":"ERR_PNPM_LICENSES_NO_LOCKFILE","message":"No pnpm-lock.yaml found"}}';

        await assert.rejects(
            async () => await runCommandForJson(fakeCommand(errorReport, "", 1), "`pnpm licenses ls`", { isNonZeroExitExpected: false }),
            (error: Error) => {
                assert.match(error.message, /`pnpm licenses ls`/u);
                assert.match(error.message, /exit code 1/u);
                return true;
            },
        );
    });

    // A `--json` pnpm command skips its reporter, so it writes its whole reason to STDOUT and leaves stderr empty.
    // A message built from stderr alone said only "failed with exit code 1", and the reason never reached the reader.
    it("reads the STANDARD OUTPUT when that is where the reason is", async () => {
        const errorReport = '{"error":{"code":"ERR_PNPM_LICENSES_NO_LOCKFILE","message":"No pnpm-lock.yaml found"}}';

        await assert.rejects(
            async () => await runCommandForJson(fakeCommand(errorReport, "", 1), "x", { isNonZeroExitExpected: false }),
            (error: Error) => {
                assert.match(error.message, /ERR_PNPM_LICENSES_NO_LOCKFILE/u);
                return true;
            },
        );
    });

    it("names a fact once, however many streams carry it", async () => {
        const marker = "ERR_PNPM_DUPLICATED";

        await assert.rejects(
            async () => await runCommandForJson(fakeCommand(marker, marker, 1), "x", { isNonZeroExitExpected: false }),
            (error: Error) => {
                assert.equal(error.message.split(marker).length - 1, 1, `the fact appears more than once: ${error.message}`);
                return true;
            },
        );
    });

    it("quotes the diagnostics when a run fails", async () => {
        await assert.rejects(
            async () => await runCommandForJson(fakeCommand("", "ERR_PNPM_META_FETCH_FAIL connect ECONNREFUSED", 1), "x", { isNonZeroExitExpected: false }),
            /ERR_PNPM_META_FETCH_FAIL/u,
        );
    });

    it("keeps the failure as the cause, so nothing about it is lost", async () => {
        try {
            await runCommandForJson(fakeCommand("", "", 3), "x", { isNonZeroExitExpected: false });
            assert.fail("it returned instead of throwing");
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(error.cause instanceof Error);
        }
    });
});

describe("runCommandForJson and a run that did not finish", () => {
    // A signal is never an ordinary answer. Whatever is on stdout is what the command had written when it died, and a
    // complete JSON value there is a fragment of the work rather than the result.
    it("refuses a killed run, even when its stdout holds a complete value", async () => {
        const script = 'process.stdout.write(\'{"cached":true}\'); process.kill(process.pid, "SIGKILL");';

        await assert.rejects(
            async () => await runCommandForJson(`node -e ${JSON.stringify(script)}`, "x", { isNonZeroExitExpected: true }),
            (error: Error) => {
                assert.match(error.message, /did not finish/u);
                assert.match(error.message, /SIGKILL/u);
                return true;
            },
        );
    });

    it("names a timeout as a timeout, and says how long it waited", async () => {
        // The real limit is fifteen minutes, so this drives the same branch through the signal a timeout sends.
        const script = 'process.stdout.write("partial"); process.kill(process.pid, "SIGTERM");';

        await assert.rejects(
            async () => await runCommandForJson(`node -e ${JSON.stringify(script)}`, "x", { isNonZeroExitExpected: true }),
            (error: Error) => {
                assert.match(error.message, /ran longer than/u);
                return true;
            },
        );
    });

    // The WIRING, and not the constant. A case that asserted only the constant's range passed with the `timeout` option
    // removed from `exec` altogether, which is the whole thing this guards.
    it("really passes the timeout to the command, so a hung run is stopped", async () => {
        const startedAt = Date.now();

        await assert.rejects(
            async () => await runCommandForJson("sleep 30", "`sleep`", { isNonZeroExitExpected: false, timeoutMs: 1500 }),
            (error: Error) => {
                assert.match(error.message, /ran longer than 1.5 seconds/u);
                return true;
            },
        );

        assert.ok(Date.now() - startedAt < 10_000, "the command was not stopped");
    });

    it("waits fifteen minutes by default, because the incident this package was written after was a run that hung", () => {
        assert.equal(commandTimeoutMs, 15 * 60 * 1000);
    });
});

describe("runCommandForJson and a command that cannot run", () => {
    // The shell's `command not found` names no code, no host and no status, so the report says it recognised nothing
    // rather than copy the line. The COMMAND's own name is in the message, and that is what identifies the failure.
    it("names the command, and says it recognised nothing in the output", async () => {
        await assert.rejects(
            async () => await runCommandForJson("thisCommandDoesNotExistAnywhere --json", "`thisCommand`", { isNonZeroExitExpected: false }),
            (error: Error) => {
                assert.match(error.message, /`thisCommand`/u);
                assert.match(error.message, /could not be run|none of them named/u);
                return true;
            },
        );
    });
});

describe("runCommandForJson and secrets", () => {
    it("removes a credential from the diagnostics it quotes back", async () => {
        const diagnostics = "GET https://ci-user:s3cr3t-token@registry.example.test/x: 401";

        await assert.rejects(
            async () => await runCommandForJson(fakeCommand("", diagnostics, 1), "x", { isNonZeroExitExpected: false }),
            (error: Error) => {
                assert.ok(!error.message.includes("s3cr3t-token"), `the credential reached the message: ${error.message}`);
                assert.match(error.message, /registry\.example\.test/u);
                return true;
            },
        );
    });
});

// Node prints the WHOLE cause chain for an uncaught error, and neither bin of this package catches. So attaching the
// rejection from `exec` put its raw `stdout`, `stderr`, `cmd` and `message` in the log beside the redacted message,
// three times over, and the redaction bought nothing.
describe("runCommandForJson and what reaches an uncaught error", () => {
    /**
     * Flattens everything Node would print for one error.
     *
     * @param error The error to flatten.
     * @returns Its message, its cause's message and stack, and its cause's own property names.
     */
    function wholeChain(error: unknown): string {
        const cause = (error as { cause?: Error }).cause;
        return [(error as Error).message, cause?.message ?? "", cause?.stack ?? "", JSON.stringify(Object.keys(cause ?? {}))].join("\n");
    }

    for (const [name, output, diagnostics, isNonZeroExpected] of [
        ["on the standard error", "", "ERR https://user:CAUSESECRET@reg.example.test/p", false],
        ["on the standard output", '{"error":{"detail":"https://user:CAUSESECRET@reg.example.test/p"}}', "", false],
    ] as const) {
        it(`keeps a credential ${name} out of the cause chain`, async () => {
            const script = `process.stdout.write(${JSON.stringify(JSON.stringify(output).slice(1, -1))}); process.stderr.write(${JSON.stringify(diagnostics)}); process.exit(1);`;

            try {
                await runCommandForJson(`node -e ${JSON.stringify(script)}`, "`probe`", { isNonZeroExitExpected: isNonZeroExpected });
                assert.fail("it returned instead of throwing");
            } catch (error) {
                assert.ok(!wholeChain(error).includes("CAUSESECRET"), `the credential reached the chain: ${wholeChain(error).slice(0, 240)}`);
            }
        });
    }

    it("attaches a cause that carries no stream at all", async () => {
        try {
            await runCommandForJson("node -e \"process.stderr.write('boom'); process.exit(1);\"", "x", { isNonZeroExitExpected: false });
            assert.fail("it returned instead of throwing");
        } catch (error) {
            const cause = (error as { cause?: Error }).cause;
            assert.ok(cause instanceof Error);
            // `stdout`, `stderr` and `cmd` are what Node's `exec` attaches, and each one is a whole stream.
            for (const property of ["stdout", "stderr", "cmd"]) {
                assert.ok(!(property in cause), `the cause still carries ${property}`);
            }
        }
    });
});
