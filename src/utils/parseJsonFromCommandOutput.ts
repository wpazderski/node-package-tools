import { summarizeCommandOutput } from "./commandOutputReport.ts";

// pnpm does not keep every diagnostic off stdout, so the stream this tool parses can carry text around the JSON payload.
// A measured `check-outdated-packages` run died with `Unexpected token ' ', " WARN GET"... is not valid JSON`, because
// `WARN GET <registry>/npm-run-all error (ECONNRESET). Will retry` landed on stdout ahead of the document.
// The run reported nothing at all, after 14 minutes, for a transient retry that pnpm itself recovered from.
//
// **The noise is removed at its source, by `--use-stderr` at each call site, and this parse guesses at nothing.**
//
// Two tolerant designs came before this one, and each returned a FRAGMENT of a cut-short document as the answer.
// Every rule that picks some bytes out of a noisy stream is a guess, and a wrong guess is a confident wrong answer that
// nothing downstream can question. A loud failure is always the better outcome: the command can be run again.
//
// What this adds is the REPORT: the command's name, and whatever of its output is safe to quote.
// `commandOutputReport.ts` decides that, by an allowlist. The original failure named none of it.

/**
 * Parses the JSON value a command printed, and says what the command printed when there is none.
 *
 * It returns `unknown`, exactly as `JSON.parse` does, so the cast stays at the call site where the expected type is
 * known.
 *
 * @param commandOutput Everything the command wrote to its standard output.
 * @param commandDescription How the command is named in the message, for example `` `pnpm outdated` ``.
 * @param commandDiagnostics Whatever the command wrote to its standard error, if the caller has it.
 * @returns The parsed value.
 * @throws When the output is not one JSON value.
 */
export function parseJsonFromCommandOutput(commandOutput: string, commandDescription: string, commandDiagnostics = ""): unknown {
    try {
        return JSON.parse(commandOutput);
    } catch (parseError) {
        // The cause is REBUILT, and the original is never attached. `JSON.parse` quotes the text it choked on in its own
        // message, and Node prints the whole cause chain for an uncaught error. Neither bin catches, so the raw output
        // would reach the log whatever this message says.
        const cause = new Error(parseError instanceof Error ? parseError.name : "Error");
        const report = summarizeCommandOutput(commandDiagnostics, commandOutput);
        if (commandOutput.trim() === "") {
            // eslint-disable-next-line preserve-caught-error
            throw new Error(`${commandDescription} printed nothing on its standard output, so there was no JSON value to parse.${report}`, { cause });
        }
        // eslint-disable-next-line preserve-caught-error
        throw new Error(`${commandDescription} did not print one JSON value.${report}`, { cause });
    }
}
