// What a failed command is allowed to say in an error message.
//
// **Nothing here COPIES the command's output. Every quoted word is one this file captured on purpose.**
//
// Five verification rounds attacked a blocklist that tried to find the secrets and remove them. Each round found a
// shape it missed, each fix introduced a new one, and the fourth fix was worse than what it replaced: it left the
// credential in `token=<short value> was rejected` and deleted the word `was`.
//
// An allowlist of line SHAPES was the next attempt, and it failed the same way for the same reason: one loose pattern,
// "a plain English sentence", matched `SECRETTOKENonalineofitsown`. Any rule that decides whether to copy a line has to
// be right about every line.
//
// So this copies nothing. It looks for a small number of FACTS - an error code, a host, an HTTP status, an errno - and
// it builds a new sentence out of the ones it found. A shape nobody anticipated contributes no fact, so it contributes
// no text. The reader is told how many lines were not summarized, and can run the command again to read them.
//
// **The honest limit.** A fact is still copied text, so a secret that has the exact shape of one is printed. That means
// an all-uppercase word of the form `ERR_...` or `E...`, or a string that parses as a dotted host name. A registry
// token is mixed case with digits, so none of those shapes fits one, but the claim is "nothing UNRECOGNISED escapes"
// and never "nothing at all".

/**
 * How many distinct facts of EACH KIND one report may carry.
 *
 * The budget is per kind, and it is never one budget spent in scan order. Codes are scanned first, so a shared budget of
 * 12 let twelve `ERR_PNPM_*` lines crowd out the host and the status completely, and a reader needs those most.
 * Four of each is enough for a real failure, and never a whole stream.
 */
const factLimitPerKind = 4;

/**
 * A pnpm or npm error code, as a STANDALONE token.
 *
 * It must open a line or follow whitespace or an opening bracket. `\b` was not enough: it breaks on `=` and on `-`, so
 * the pattern reached inside a longer token and `NPM_TOKEN=ERR_J7TQ2XKLM4NP6RS` printed the whole value. That is the
 * same hole the errno list closed, in its sibling.
 * A real code opens a line or follows a space, or it is the value of a JSON `"code"` key. A `--json` command writes its
 * whole failure as `{"error":{"code":"ERR_PNPM_LICENSES_NO_LOCKFILE",...}}`, so that third form is a real one.
 *
 * A bare quote is NOT a delimiter, and a bracket is not one either. `'ERR_WQ7RT2YU9IOP'` is far likelier a quoted secret
 * than a code, and the `"code"` key is what separates the one real quoted shape from it. A code that arrives in some
 * other quoted position is simply not reported, and the report then says it named nothing. That is the safe direction.
 */
const errorCodePattern = /(?:^|(?<=\s)|(?<="code"\s{0,4}:\s{0,4}"))ERR_[A-Z][A-Z0-9_]{2,63}(?![\w-])/gmu;

/**
 * The errnos and npm codes that may be named.
 *
 * **A closed list, and not a shape.** A pattern of `E` plus uppercase characters reached INSIDE a longer token, because
 * `\b` breaks on `=` and `-`: `NPM_TOKEN=EJ7TQ2XKLM4NP6RS rejected` printed the whole secret, and
 * `X-Api-Key: SECRET-EABCDEF123456-XYZ` printed a fragment of one.
 * Naming what may be printed is the same principle as the rest of this file.
 */
const namedFailureCodes: readonly string[] = [
    // Node's network and filesystem errnos, which are what a failed fetch or a bad path reports.
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "EPIPE",
    "EADDRINUSE",
    "EACCES",
    "EPERM",
    "ENOENT",
    "ENOTDIR",
    "EISDIR",
    "EEXIST",
    "EMFILE",
    "ENOSPC",
    "ENOMEM",
    "EROFS",
    // npm's own coded failures.
    "E401",
    "E403",
    "E404",
    "E409",
    "E426",
    "E429",
    "E500",
    "E503",
];

/** Each name above, as a whole word. */
const failureCodePattern = new RegExp(`(?<![\\w+/=:@.-])(?:${namedFailureCodes.join("|")})(?![\\w+/=@-])(?![.:]\\S)`, "gu");

/**
 * An HTTP status, and ONLY where something says it is one.
 *
 * TWO exact shapes, and never a gap that text can bridge. A `[^\d\n]{0,12}` gap made `GET http://cdn.io/500 failed`
 * report `HTTP 500` for a path segment, and `x-status: SECRET-503-KEY` report `HTTP 503` from inside a credential.
 * The same gap could not reach `HTTP/1.1 500`, because `/1.1 ` holds digits: the commonest wire form of the very fact
 * this exists to capture was the one it missed.
 *
 * **The separator classes hold no newline, and `\s` must never come back here.**
 * `\s` matches a line break, so a label at the end of one line reached the digits at the start of the next. That made
 * `... HTTP/1.1\nProgress: resolved 404, reused 0` report `HTTP 404`, which is pnpm's resolution counter and not a
 * status any server sent. A wrapped header value, such as `x-ratelimit-status\n429`, reads the same way.
 *
 * A fact that can be fabricated is worse than a fact that is missing, because a reader acts on it.
 */
const httpStatusPatterns: readonly RegExp[] = [
    // `HTTP/1.1 500`, `HTTP/2 403`.
    /\bHTTP\/\d(?:\.\d)?[ \t]{1,3}(?<status>[45]\d\d)(?![\w.-])/giu,
    // `HTTP 401`, `status: 404`, `status code 500`, `"statusCode":403`.
    //
    // The leading guard rejects EVERY character that can carry a parameter into a label. `?` and `&` alone were not
    // enough: `#status=404`, `;status=503`, `/status=503` and `cache.status:500` all read as a label and reported a
    // status no server sent. The `&amp;` form matters most, because a proxy echoes an HTML error body into stderr.
    //
    // The last guard closes the quote separators. `status="503"SECRETTAIL` and `'429'-SECRET` put digits from inside an
    // opaque value where a status goes, and the closing quote satisfied `(?![\w.-])` on its own.
    //
    // The separator takes FOUR characters, and not three. `{"status": "404"}` spends all four on `": "`, and that is
    // the commonest shape of a JSON error body. Every character of the class is punctuation or a space, so a longer
    // run reaches no further into a value: `x-status: SECRET-503` still stops at `S`.
    /(?<![?&#;./\w])(?:HTTP|status(?: ?code)?)["' \t:=]{1,4}(?<status>[45]\d\d)(?![\w.-])(?!["']\s{0,2}[\w-])/giu,
];

/**
 * The HOST of a URL, and nothing else of it.
 *
 * Userinfo sits between the `//` and the host, and a token is as likely to be in a query string, so only the part after
 * the last `@` and before the first `/`, `?` or `#` is taken. That is what tells a reader which registry refused them.
 *
 * The scheme is OPTIONAL, because an `.npmrc` line is scheme-relative: `//registry.example.test/:_authToken=...` names
 * the registry, and a pattern that demanded a scheme reported nothing for it.
 *
 * The match must OPEN a line or follow whitespace. Without that, a `//` inside a password started a fresh scan past the
 * "everything before the last `@` goes" rule: `https://u:p//SECRET.TOKEN.abc/x` printed the tail of the password.
 *
 * **`:` is deliberately NOT in that class, so `url:https://host/x` names no host.** Adding it would let
 * `https://u:p://SECRET.TOKEN.abc/x` match with `p:` as the scheme, which prints the tail of the password. A missed
 * host costs a reader one fact. That leak costs them a credential, so the class stays as it is.
 * `registry=<url>` and `--registry=<url>`, which is where a registry URL usually appears, both work through `=`.
 *
 * **That start rule is also what bounds the WORK, and the `{0,31}` on the scheme is no longer what does it.**
 * An earlier form of this pattern had an unbounded scheme run and no start rule, and it took 22 seconds on 200 KB,
 * because it began an attempt at every one of 200000 positions. The start rule cuts those positions to the line starts.
 * Keep the start rule. `{0,31}` stays because no real scheme is longer, and it is measured at no cost, but a change that
 * removes the start rule and trusts `{0,31}` brings the slow behavior back.
 */
const urlHostPattern = /(?:(?:^|(?<=[\s"'(<[=]))[a-z][a-z0-9+.-]{0,31}:\/\/|(?:^|(?<=\s))\/\/(?=[^\s/?#]{1,512}\/:))(?<authority>[^\s/?#]{0,512})/gimu;

/** A host that is a plausible name, and not a token that happens to sit where a host would. */
const plausibleHostPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}\.){1,8}[a-zA-Z]{2,24}(?::\d{1,5})?$/u;

/** The longest host this may print. DNS allows 253, and a real registry host is far shorter. */
const hostLengthLimit = 120;

/**
 * Collects the facts one text holds, in the order a reader wants them.
 *
 * @param text The command's output.
 * @returns The facts, each one already safe to print, with no duplicates.
 */
function collectFacts(text: string): string[] {
    const facts: string[] = [];
    const countByKind = new Map<string, number>();
    // The limit is PER KIND, and not one budget spent in scan order. Codes are scanned first, so a shared budget let 12
    // `ERR_PNPM_*` lines crowd out the host and the status completely, and those are the facts a reader needs most.
    const add = (kind: string, fact: string): void => {
        const countSoFar = countByKind.get(kind) ?? 0;
        if (!facts.includes(fact) && countSoFar < factLimitPerKind) {
            countByKind.set(kind, countSoFar + 1);
            facts.push(fact);
        }
    };
    for (const match of text.matchAll(errorCodePattern)) {
        add("code", match[0]);
    }
    for (const match of text.matchAll(urlHostPattern)) {
        const authority = match.groups?.["authority"] ?? "";
        // The part after the LAST `@` is the host and port. Everything before it is userinfo.
        const hostAndPort = authority.includes("@") ? authority.slice(authority.lastIndexOf("@") + 1) : authority;
        if (hostAndPort.length <= hostLengthLimit && plausibleHostPattern.test(hostAndPort)) {
            add("host", `host ${hostAndPort}`);
        }
    }
    for (const pattern of httpStatusPatterns) {
        for (const match of text.matchAll(pattern)) {
            add("status", `HTTP ${match.groups?.["status"] ?? ""}`);
        }
    }
    for (const match of text.matchAll(failureCodePattern)) {
        add("errno", match[0]);
    }
    return facts;
}

/**
 * How much of the output the FACT SCAN reads.
 *
 * Every pattern below runs over this many characters at most, so a 60 MB stream cannot make the report the slow part of
 * a failure. A fact past this point is not named, and the line count still covers the whole output.
 */
const scannedCharacterLimit = 200_000;

/**
 * Counts the lines of the output that hold something.
 *
 * It reads the string one character at a time rather than with `split`, because `split` allocates an array of every
 * line, and this runs over the WHOLE output, which `execAsync` allows to reach 64 MB.
 *
 * @param text The whole output.
 * @returns The number of lines that are not empty and not whitespace alone.
 */
function countNonEmptyLines(text: string): number {
    let count = 0;
    let doesLineHoldSomething = false;
    for (const character of text) {
        if (character === "\n") {
            if (doesLineHoldSomething) {
                count += 1;
            }
            doesLineHoldSomething = false;
            continue;
        }
        if (character !== "\r" && character.trim() !== "") {
            doesLineHoldSomething = true;
        }
    }
    return doesLineHoldSomething ? count + 1 : count;
}

/**
 * Builds the part of an error message that says what a command wrote.
 *
 * @param streams The command's output, in the order it should be read.
 * @returns A sentence built from the facts found, and a count of the lines behind them.
 */
export function summarizeCommandOutput(...streams: string[]): string {
    const wholeOutput = streams.join("\n");
    // A bound on what the FACT SCAN reads, so a 60 MB stream cannot make it the slow part.
    // The line COUNT is taken from the whole output instead. The count is itself a fact the reader acts on, and a count
    // of the slice reported 100000 lines for an output of 200001. A wrong number stated as a fact is worse than none.
    const text = wholeOutput.slice(0, scannedCharacterLimit);
    const lineCount = countNonEmptyLines(wholeOutput);
    if (lineCount === 0) {
        return "";
    }
    const facts = collectFacts(text);
    const lineNote = `It wrote ${String(lineCount)} line(s)`;
    if (facts.length === 0) {
        return `\n${lineNote}, and none of them named a code, a host or a status. Run the command again to read them.`;
    }
    return `\n${lineNote}. What they name: ${facts.join(", ")}.\nRun the command again to read them in full.`;
}
