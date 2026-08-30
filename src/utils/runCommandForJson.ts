import { summarizeCommandOutput } from "./commandOutputReport.ts";
import { execAsync, maximumCommandOutputBytes } from "./execAsync.ts";

// Runs a command that answers with JSON, and reports every way it can fail to answer.
//
// **The exit code is part of the answer, and it is not the same question for both commands.**
// `pnpm outdated` exits non-zero as its ORDINARY result, when a package is outdated, and the document is on stdout all
// the same. `pnpm licenses ls` exits non-zero only when it FAILED, and it then prints `{"error":{...}}` to stdout as
// valid JSON. A caller that parsed that got the error report back as its package list, and the failure surfaced later
// as `TypeError: pnpmPackages is not iterable` with no command name and no reason in it.
//
// It also separates a stream that was CUT SHORT. Node's `exec` does not fail cleanly at its `maxBuffer` limit: it
// rejects with a TRUNCATED stream, and a caller that read that would get a half-document.

/** What a command wrote, and how it ended. */
export interface CommandOutput {
    /** Everything on the standard output. */
    stdout: string;

    /** Everything on the standard error. It carries the reason whenever the standard output holds no document. */
    stderr: string;

    /** The exit code, or `null` when a signal ended the command. */
    exitCode: number | null;

    /** The signal that ended the command, if one did. */
    signal: NodeJS.Signals | null;
}

/** How long a command may run. A run that hangs is the failure this package was written after. */
export const commandTimeoutMs: number = 15 * 60 * 1000;

/**
 * Whether a non-zero exit is an ordinary answer for a command, or a failure.
 */
export interface RunCommandOptions {
    /**
     * Whether a non-zero exit still carries the document.
     *
     * `pnpm outdated` sets this: it exits 1 when a package is outdated, which is the ordinary case.
     * `pnpm licenses ls` must NOT, because its non-zero exit means it failed and printed an error report instead.
     */
    isNonZeroExitExpected: boolean;

    /**
     * How long the command may run, in milliseconds. It defaults to {@link commandTimeoutMs}.
     *
     * A test overrides it. Without that, the only case that could cover the timeout asserted the CONSTANT's range, and
     * it passed with the `timeout` option removed from `exec` altogether.
     */
    timeoutMs?: number;
}

/**
 * Builds a cause that carries no secret.
 *
 * **Node prints the WHOLE cause chain for an uncaught error, and neither bin catches.** So attaching the rejection from
 * `exec` put the raw `stdout`, `stderr`, `cmd` and `message` in the log beside the redacted message, three times over,
 * and the redaction bought nothing. This keeps the stack, which is what a cause is for, and drops every stream.
 *
 * @param error The rejection from `exec`.
 * @returns An error with the same stack, redacted, and no stream properties.
 */
function redactedCause(error: Error): Error {
    // The NAME alone. A message or a stack from `exec` embeds the command line and the streams, and a stack frame path
    // is of no use to a reader of a CI log. Nothing here can carry a credential.
    return new Error(error.name);
}

/**
 * Reads the exit code and the signal off a rejection from `exec`.
 *
 * @param error The rejection.
 * @returns The code and the signal, either of which can be absent.
 */
function readExitState(error: Error): { exitCode: number | null; signal: NodeJS.Signals | null } {
    const code = "code" in error ? error.code : undefined;
    const signal = "signal" in error ? error.signal : undefined;
    return {
        exitCode: typeof code === "number" ? code : null,
        signal: typeof signal === "string" ? (signal as NodeJS.Signals) : null,
    };
}

/**
 * Runs a command and returns both of its streams, with how it ended.
 *
 * @param command The command line to run.
 * @param commandDescription How the command is named in an error message.
 * @param options Whether a non-zero exit is an ordinary answer.
 * @returns What the command wrote.
 * @throws When the command could not run, was cut short, was killed, or failed in a way its caller does not expect.
 */
export async function runCommandForJson(command: string, commandDescription: string, options: RunCommandOptions): Promise<CommandOutput> {
    const timeoutMs = options.timeoutMs ?? commandTimeoutMs;
    try {
        const { stdout, stderr } = await execAsync(command, { maxBuffer: maximumCommandOutputBytes, timeout: timeoutMs });
        return { stdout: stdout, stderr: stderr, exitCode: 0, signal: null };
    } catch (error) {
        if (!(error instanceof Error)) {
            throw error;
        }
        const { exitCode, signal } = readExitState(error);
        // BOTH streams, and stdout matters most for a `--json` command.
        // `--json` makes pnpm skip its reporter, so `pnpm licenses ls --json` writes its whole reason to STDOUT as
        // `{"error":{...}}` and leaves stderr empty. A message that quoted stderr alone said only "failed with exit
        // code 1", and the reason pnpm gave never reached the reader.
        const failureOutput = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
        const failureDiagnostics = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
        // BOTH streams. A `--json` pnpm command skips its reporter, so it writes its whole reason to STDOUT and leaves
        // stderr empty. `error.message` is NOT included: `exec` builds it from the command line and stderr, and the
        // command line can hold a registry URL with its credential.
        const diagnosticsPart = summarizeCommandOutput(failureDiagnostics, failureOutput);
        if ("code" in error && error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            // The message names the stream, as in `stdout maxBuffer length exceeded`. A stderr overflow must not be
            // reported as a lost document.
            const stream = error.message.startsWith("stderr") ? "standard error" : "standard output";
            throw new Error(
                `${commandDescription} wrote more than ${String(maximumCommandOutputBytes)} bytes to its ${stream}, so that stream was cut short. Raise \`maximumCommandOutputBytes\`.`,
                {
                    // eslint-disable-next-line preserve-caught-error
                    cause: redactedCause(error),
                },
            );
        }
        // A SIGNAL is never an ordinary answer. Whatever is on stdout is whatever the command had written when it died,
        // and a complete JSON value there would be a fragment of the work, not the result.
        if (signal !== null) {
            const reason = signal === "SIGTERM" ? `it ran longer than ${String(timeoutMs / 1000)} seconds and was stopped, by SIGTERM` : `it was killed by ${signal}`;
            // eslint-disable-next-line preserve-caught-error
            throw new Error(`${commandDescription} did not finish: ${reason}.${diagnosticsPart}`, { cause: redactedCause(error) });
        }
        if ("stdout" in error && typeof error.stdout === "string" && options.isNonZeroExitExpected) {
            return { stdout: error.stdout, stderr: "stderr" in error && typeof error.stderr === "string" ? error.stderr : "", exitCode: exitCode, signal: null };
        }
        // The command FAILED, and its caller does not treat a non-zero exit as an answer.
        // `pnpm licenses ls --json` prints `{"error":{...}}` to stdout here, which parses, so the exit code is the only
        // thing that tells a report of failure from a report of licences.
        // `error.message` already embeds stderr, so it is NOT quoted here as well: that doubled the text and halved the
        // budget for the part a reader needs. The streams above carry everything.
        //
        // The cause is REDACTED and never the original, which is what `preserve-caught-error` asks for. The original
        // carries the raw `stdout`, `stderr` and `cmd`, and Node prints the whole cause chain for an uncaught error, so
        // preserving it would put every credential in the log beside the redacted message. `redactedCause` keeps the
        // stack, which is the part a reader needs.
        const codePart = exitCode === null ? "" : ` with exit code ${String(exitCode)}`;
        // eslint-disable-next-line preserve-caught-error
        throw new Error(`${commandDescription} failed${codePart}.${diagnosticsPart}`, { cause: redactedCause(error) });
    }
}
