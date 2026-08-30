import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeCommandOutput } from "./commandOutputReport.ts";

// **Nothing here copies the command's output. Every quoted word is one the module captured on purpose.**
//
// Five verification rounds attacked a blocklist that hunted for secrets. Each round found a shape it missed, and the
// fourth fix was worse than what it replaced. An allowlist of line SHAPES failed the same way: one loose pattern, "a
// plain English sentence", matched `SECRETTOKENonalineofitsown`.
//
// So these cases ask one question for every shape at once: can anything the module did not capture reach the message.

/** Every secret shape the five rounds found, plus shapes invented to be outside every pattern. */
const secretLines = [
    "GET https://user:s3cr3t@registry.example.test/foo",
    "GET https://user:tok%2FEN+SECRET@registry.example.test/foo",
    "GET https://user:p@sswordSECRET@registry.example.test/foo",
    "GET https://SECRETTOKEN@registry.example.test/foo",
    "GET https://user:ab/cd+ef=@registry.example.com/foo",
    `GET https://SECRET${"T".repeat(600)}@registry.example.test/x`,
    "//registry.example.test/:_authToken=SECRETTOKEN",
    "//registry.example.test/:_authToken=Bearer SECRETTOKEN",
    "GET https://registry.example.test/x?_auth=SECRETTOKEN",
    "GET https://registry.example.test/x?token=SECRETTOKEN",
    "authorization: SECRETTOKEN",
    "Authorization: Bearer eyJhbGciSECRETTOKEN.payload.sig",
    "Authorization: Basic dXNlcjpTRUNSRVRUT0tFTg==",
    "Authorization: DPoP eyJSECRETTOKEN.payload.sig",
    "x-api-key: sk-proj-SECRETTOKEN",
    "WARN config _authToken=ghp_SECRETTOKEN was rejected by the registry",
    "npm ERR! request to https://reg.example.test/x?token=SECRETTOKEN failed, reason: getaddrinfo",
    'ERR_PNPM_X {"error":{"detail":"api_key=SECRETTOKEN invalid; retry later"}}',
    "password=SECRETTOKEN was rejected",
    '{"token":"SECRET,TOKEN,PARTS"}',
    "token=SECRETONE and token=SECRETTWO",
    "token='SECRETQUOTED' next",
    "npm_config_registry=https://user:SECRETTOKEN@reg.example.test/",
    "PRIVATE-TOKEN: SECRETTOKEN",
    "cookie: session=SECRETTOKEN; path=/",
    "--header 'X-Custom-Auth: SECRETTOKEN'",
    // Invented, and outside every pattern this module holds. A blocklist can only miss these.
    "quantum_handshake_material=SECRETTOKEN",
    "X-Made-Up-Credential: SECRETTOKEN",
    "SECRETTOKENonalineofitsown",
    "-----BEGIN PRIVATE KEY-----SECRETTOKEN-----END PRIVATE KEY-----",
    "Proxy-Authorization: Kerberos SECRETTOKEN",
];

/** Anything that looks like one of the secrets above. */
const secretShapes = /SECRET|s3cr3t|ghp_|sk-proj-|dXNlcjpTRUNSRVRUT0tFTg|eyJ|PRIVATE KEY|Kerberos|session=/u;

describe("summarizeCommandOutput carries no secret", () => {
    for (const line of secretLines) {
        it(`out of: ${line.slice(0, 52)}`, () => {
            assert.doesNotMatch(summarizeCommandOutput(line), secretShapes);
        });
    }

    it("out of ALL of them at once, which is what a real diagnostic looks like", () => {
        assert.doesNotMatch(summarizeCommandOutput(secretLines.join("\n")), secretShapes);
    });

    it("out of either stream, and out of both together", () => {
        assert.doesNotMatch(summarizeCommandOutput("token=SECRETONE", "token=SECRETTWO"), secretShapes);
    });
});

describe("summarizeCommandOutput still names what a reader acts on", () => {
    it("the pnpm error code", () => {
        assert.match(summarizeCommandOutput("ERR_PNPM_LICENSES_NO_LOCKFILE  No pnpm-lock.yaml found"), /ERR_PNPM_LICENSES_NO_LOCKFILE/u);
    });

    it("the HOST of the registry that refused, and never its credential", () => {
        const report = summarizeCommandOutput("ERR_PNPM_FETCH_401  GET https://user:s3cr3t@registry.example.test/@scope%2Fpkg: HTTP 401");

        assert.match(report, /registry\.example\.test/u);
        assert.match(report, /HTTP 401/u);
        assert.doesNotMatch(report, secretShapes);
    });

    it("the errno of a network failure", () => {
        assert.match(summarizeCommandOutput("Error: connect ECONNREFUSED 127.0.0.1:443"), /ECONNREFUSED/u);
    });

    it("how many lines it did not summarize", () => {
        assert.match(summarizeCommandOutput("ERR_PNPM_X boom\nsecond line\nthird line"), /3 line\(s\)/u);
    });

    it("that it recognised nothing, rather than staying silent about it", () => {
        assert.match(summarizeCommandOutput("some entirely unknown output"), /none of them named a code, a host or a status/u);
    });

    it("nothing at all for no output", () => {
        assert.equal(summarizeCommandOutput("", "  \n "), "");
    });
});

describe("summarizeCommandOutput is bounded", () => {
    it("names at most four facts of one kind", () => {
        const many = Array.from({ length: 100 }, (_value, index) => `ERR_PNPM_CODE_${String(index)}`).join("\n");

        assert.equal((summarizeCommandOutput(many).match(/ERR_PNPM_CODE_/gu) ?? []).length, 4);
    });

    // The credential goes even when the HOST itself looks unusual. What is dropped is everything before the last `@`.
    it("drops the credential and keeps the host, whatever the host looks like", () => {
        const report = summarizeCommandOutput("ERR_PNPM_X https://ci-user:s3cr3t@odd-name.example.test/x");

        assert.match(report, /odd-name\.example\.test/u);
        assert.doesNotMatch(report, /s3cr3t|ci-user/u);
    });

    it("takes a host that is a real name, and not a token sitting where a host would", () => {
        const report = summarizeCommandOutput("ERR_PNPM_X https://SECRETTOKENWITHNODOTS/x");

        assert.doesNotMatch(report, secretShapes);
    });

    it("is not defeated by a long line, whatever shape it takes", () => {
        for (const text of [`https://${"a".repeat(1_000_000)}`, "a://".repeat(250_000), `ERR_PNPM_X https://u:${"a".repeat(1_000_000)}@h.test/x`]) {
            const startedAt = Date.now();

            summarizeCommandOutput(text);

            assert.ok(Date.now() - startedAt < 2000, `it took ${String(Date.now() - startedAt)} ms on a ${String(text.length)}-character line`);
        }
    });
});

// Round 1 of the verification of this design. It confirmed that nothing UNRECOGNISED escapes, and then showed that two
// of the four fact kinds were wide enough to be arbitrary text, and one wide enough to be a whole secret.
describe("summarizeCommandOutput and the shapes round 1 found", () => {
    // A pattern of `E` plus uppercase characters reached INSIDE a longer token: `\b` breaks on `=` and on `-`.
    for (const [name, text, secret] of [
        ["a token that begins with E, after an equals sign", "NPM_TOKEN=EJ7TQ2XKLM4NP6RS rejected", "EJ7TQ2XKLM4NP6RS"],
        ["a fragment of a hyphenated key", "X-Api-Key: SECRET-EABCDEF123456-XYZ", "EABCDEF123456"],
        ["the first group of an uppercase GUID", "key=E4F71A2B-9C3D-4E5F-A6B7-C8D9E0F1A2B3", "E4F71A2B"],
        ["a quoted uppercase token", "'EWQ7RT2YU9IOP'", "EWQ7RT2YU9IOP"],
    ] as const) {
        it(`does not print ${name}`, () => {
            assert.ok(!summarizeCommandOutput(text).includes(secret), `it printed the token: ${summarizeCommandOutput(text)}`);
        });
    }

    // A fact that can be FABRICATED is worse than one that is missing, because a reader acts on it. Each of these made
    // a report name an HTTP status for a request that was never made; the first one happened in a real run.
    for (const [name, text] of [
        ["a directory name that ends in a number", "ERR_PNPM_X in /private/tmp/claude-501/x"],
        ["a port", "Error: connect ECONNREFUSED 127.0.0.1:443"],
        ["a build number in a path", "pnpm 9.15.4 could not read left-pad@4.12.0 in /opt/build-472/x"],
    ] as const) {
        it(`invents no HTTP status from ${name}`, () => {
            assert.doesNotMatch(summarizeCommandOutput(text), /HTTP \d/u);
        });
    }

    it("still names a status when something says it IS one", () => {
        assert.match(summarizeCommandOutput("GET https://reg.example.test/x: HTTP 401"), /HTTP 401/u);
    });

    // The `.npmrc` shape is scheme-relative, and a pattern that demanded a scheme reported nothing for it.
    it("names the registry of a scheme-relative line, and not its token", () => {
        const report = summarizeCommandOutput("//registry.example.test/:_authToken=SECRETTOKEN");

        assert.match(report, /registry\.example\.test/u);
        assert.doesNotMatch(report, secretShapes);
    });

    it("names the registry of a URL that has a query and no path", () => {
        const report = summarizeCommandOutput("https://registry.example.com?token=SECRETTOKEN");

        assert.match(report, /registry\.example\.com/u);
        assert.doesNotMatch(report, secretShapes);
    });

    it("prints no host longer than a host can be", () => {
        const report = summarizeCommandOutput(`https://${"ab.".repeat(330)}com/x`);

        assert.ok(report.length < 300, `the report is ${String(report.length)} characters`);
    });

    it("turns ordinary uppercase English into no facts at all", () => {
        assert.match(summarizeCommandOutput("ERROR: THE ENTIRE EXPORT ENV FAILED"), /none of them named/u);
    });

    // The load-bearing line of the credential defense, and no case reached it: with the FIRST `@`, the slice keeps an
    // `@` and then fails the host check, so the report goes silent and a "carries no secret" case still passes.
    it("takes the host after the LAST at sign, and not the first", () => {
        const report = summarizeCommandOutput("ERR_PNPM_X https://user:p@sswordSECRET@registry.example.test/x");

        assert.match(report, /host registry\.example\.test/u);
        assert.doesNotMatch(report, /SECRET/u);
    });
});

// Round 2 read the module and found that 12 of 14 semantic mutations survived every case above. A knob nothing pins is
// a knob the next edit moves in silence, and the whole substance of this module is in its knobs. These cases pin them.
//
// The order below follows the order of the constants in the module, so a reader can check that none is missing.
describe("summarizeCommandOutput pins each bound it depends on", () => {
    it("reports a code that opens a line, and NOT one inside a longer token", () => {
        // The lookarounds are the whole defense. `\b` breaks on `=` and on `-`, so it let the pattern reach into a
        // credential that happened to hold the prefix.
        assert.match(summarizeCommandOutput("ERR_PNPM_FETCH_401 failed"), /ERR_PNPM_FETCH_401/u);
        assert.doesNotMatch(summarizeCommandOutput("NPM_TOKEN=ERR_J7TQ2XKLM4NP6RS"), /J7TQ2XKLM4NP6RS/u);
        assert.doesNotMatch(summarizeCommandOutput("X-Api-Key: SECRET-ERR_ABCDEF123456-XYZ"), /ABCDEF123456/u);
        assert.doesNotMatch(summarizeCommandOutput("'ERR_WQ7RT2YU9IOP'"), /WQ7RT2YU9IOP/u);
    });

    it("reports the code of a JSON `code` key, and not the value of another key", () => {
        // The one real quoted shape. A `--json` command writes its whole failure this way.
        assert.match(summarizeCommandOutput('{"error":{"code":"ERR_PNPM_NO_LOCKFILE"}}'), /ERR_PNPM_NO_LOCKFILE/u);
        assert.doesNotMatch(summarizeCommandOutput('{"token":"ERR_WQ7RT2YU9IOP"}'), /WQ7RT2YU9IOP/u);
    });

    it("reports an errno as a whole word, and not as part of a longer one", () => {
        assert.match(summarizeCommandOutput("connect ECONNREFUSED 127.0.0.1:443"), /ECONNREFUSED/u);
        assert.doesNotMatch(summarizeCommandOutput("value=MYECONNREFUSEDX"), /ECONNREFUSED/u);
        assert.doesNotMatch(summarizeCommandOutput("value=ECONNREFUSED-SECRET"), /ECONNREFUSED/u);
    });

    it("reads a status from the canonical wire line, which the earlier gap could not reach", () => {
        // `HTTP/1.1 500` is the commonest form of the very fact this exists to report, and a digit-free gap missed it.
        assert.match(summarizeCommandOutput("HTTP/1.1 500 Internal Server Error"), /HTTP 500/u);
        assert.match(summarizeCommandOutput("HTTP/2 403 Forbidden"), /HTTP 403/u);
    });

    it("reads a status from each labeled form", () => {
        assert.match(summarizeCommandOutput("GET https://reg.example.test/x: HTTP 401"), /HTTP 401/u);
        assert.match(summarizeCommandOutput("status: 404"), /HTTP 404/u);
        assert.match(summarizeCommandOutput("status code 500"), /HTTP 500/u);
    });

    it("invents no status from a path segment, a port or a credential", () => {
        // A fabricated fact is worse than a missing one, because a reader acts on it. A `[^\d\n]{0,12}` gap made all
        // three of these report a status that nothing in the text had claimed.
        assert.doesNotMatch(summarizeCommandOutput("GET http://cdn.example.test/500 failed"), /HTTP 500/u);
        assert.doesNotMatch(summarizeCommandOutput("connect ECONNREFUSED 127.0.0.1:443"), /HTTP 443/u);
        assert.doesNotMatch(summarizeCommandOutput("x-status: SECRET-503-KEY"), /HTTP 503/u);
    });

    it("names 2xx and 3xx as no status at all", () => {
        // The pattern reports a FAILURE status. A success is not a fact a reader of a failure report acts on.
        assert.doesNotMatch(summarizeCommandOutput("HTTP/1.1 200 OK"), /HTTP 200/u);
        assert.doesNotMatch(summarizeCommandOutput("HTTP/1.1 302 Found"), /HTTP 302/u);
    });

    it("starts no fresh host scan at a `//` inside a credential or a query", () => {
        // Such a scan runs PAST the "everything before the last at sign goes" rule, so it printed the tail of a secret.
        assert.doesNotMatch(summarizeCommandOutput("ERR_PNPM_X https://u:p//SECRET.TOKEN.abc/x"), /SECRET/u);
        assert.doesNotMatch(summarizeCommandOutput("https://reg.example.test/x?next=//TOKENA.TOKENB.xyz"), /TOKENA/u);
    });

    it("names a scheme-relative host, which an `.npmrc` line is written as", () => {
        assert.match(summarizeCommandOutput("//registry.example.test/:_authToken=SECRET"), /registry\.example\.test/u);
        assert.doesNotMatch(summarizeCommandOutput("//registry.example.test/:_authToken=SECRET"), /SECRET/u);
    });

    it("names a host with a port, and keeps the port", () => {
        assert.match(summarizeCommandOutput("GET https://reg.example.test:8443/x"), /reg\.example\.test:8443/u);
    });

    it("names no host that breaks a rule a real host keeps", () => {
        // Each of these fails one rule of the host check, and each is the shape a secret arrives in.
        // No dot: a single label is not a host worth naming.
        assert.doesNotMatch(summarizeCommandOutput("https://SECRETTOKENVALUE/x"), /SECRETTOKENVALUE/u);
        // A last label that is not letters: no real top-level domain looks like this.
        assert.doesNotMatch(summarizeCommandOutput("https://a.b.99999/x"), /99999/u);
        // A last label longer than 24 letters.
        assert.doesNotMatch(summarizeCommandOutput(`https://a.${"z".repeat(25)}/x`), /zzzzz/u);
        // More than 9 labels.
        assert.doesNotMatch(summarizeCommandOutput(`https://${"a.".repeat(9)}com/x`), /a\.a\.a/u);
    });

    it("names no authority longer than the length limit, whatever its shape", () => {
        // Every rule but the length limit must PASS, or the case proves nothing about the limit. So each label stays
        // inside the 63-character label rule, the last label is letters, and the label count stays inside its cap.
        // The whole authority is 126 characters, which only the length limit rejects.
        const longHost = `${"a".repeat(60)}.${"b".repeat(60)}.test`;

        assert.doesNotMatch(summarizeCommandOutput(`https://${longHost}/x`), /aaaaa/u);
    });

    it("reads only the head of a very long stream", () => {
        // The slice is what bounds the work. A fact past it is not reported, and the run stays fast.
        const buriedFact = `${"x".repeat(300_000)}\nERR_PNPM_BURIED_FACT`;

        assert.doesNotMatch(summarizeCommandOutput(buriedFact), /ERR_PNPM_BURIED_FACT/u);
    });

    it("counts the lines of the WHOLE stream, and not of the part it read", () => {
        // The count is a fact about the output, so the slice must not change it.
        const report = summarizeCommandOutput(`${"y\n".repeat(200_000)}z`);

        assert.match(report, /200001 line/u);
    });

    it("names each fact once, and stops at the fact limit", () => {
        const manyHosts = Array.from({ length: 30 }, (_, index) => `https://h${String(index)}.example.test/x`).join("\n");
        const report = summarizeCommandOutput(manyHosts);

        assert.match(report, /h0\.example\.test/u);
        assert.doesNotMatch(report, /h29\.example\.test/u);
    });

    it("stays fast on a large hostile input", () => {
        // An unbounded scheme run with no start rule made this shape take 22 seconds, which is a denial of service in
        // a report builder. The START RULE is what fixed it, and this case pins that rule and not the `{0,31}` bound:
        // with the start rule in place, widening that bound is measured at no cost.
        // The run must sit INSIDE the scanned slice, or the slice cuts off the `://` and no backtracking starts.
        const hostile = `${"a".repeat(150_000)}://x`;
        const startedAt = Date.now();

        summarizeCommandOutput(hostile);

        assert.ok(Date.now() - startedAt < 2000, `it took ${String(Date.now() - startedAt)} ms`);
    });
});

// Round 3 found four defects in the rewrite, and round 4 found three more in the fixes for those. Each case below is an
// input one of those rounds reproduced. A regex guard is easy to make too wide and just as easy to make too narrow, and
// both directions have now happened here, so both directions are pinned.
describe("summarizeCommandOutput and the shapes rounds 3 and 4 found", () => {
    it("starts no host scan at a `//` that any character precedes", () => {
        // Round 3: the start rule named six characters, and every one of them restarted the scan inside a credential.
        for (const delimiter of [" ", "\t", "\n", "\r", '"', "'", "(", "<", "[", "=", "\u00a0", "\u2028"]) {
            assert.doesNotMatch(summarizeCommandOutput(`ERR_PNPM_X https://u:p${delimiter}//SECRET.TOKEN.abc/x`), /SECRET/u);
        }
    });

    it("bridges no status across a line break", () => {
        // Round 3: `\s` and `[\s:=]` match a newline, so a label reached the digits on the NEXT line.
        assert.doesNotMatch(summarizeCommandOutput("WARN GET https://r.example.com/p HTTP/1.1\nProgress: resolved 404, reused 0"), /HTTP 404/u);
        assert.doesNotMatch(summarizeCommandOutput("x-status\r\n502 secret"), /HTTP 502/u);
        assert.doesNotMatch(summarizeCommandOutput("x-ratelimit-status\n429"), /HTTP 429/u);
    });

    it("names no errno that sits inside a credential", () => {
        // Round 3: base64 punctuation, a URL password and an env value are all word boundaries to `(?<![\w-])`.
        assert.doesNotMatch(summarizeCommandOutput("_auth=aGVsbG8/EPIPE/d29ybGQ="), /EPIPE/u);
        assert.doesNotMatch(summarizeCommandOutput("_auth=aGVsbG8+ETIMEDOUT+d29ybGQ="), /ETIMEDOUT/u);
        assert.doesNotMatch(summarizeCommandOutput("GET https://ci-user:ENOENT@registry.example.test/x"), /ENOENT/u);
        assert.doesNotMatch(summarizeCommandOutput("NPM_TOKEN=EACCES"), /EACCES/u);
        assert.doesNotMatch(summarizeCommandOutput("Authorization: Bearer ECONNREFUSED.abc"), /ECONNREFUSED/u);
    });

    it("admits no character that case folding turns into an ASCII letter", () => {
        // Round 3: under `i` and `u`, U+017F folds onto `s` and U+212A onto `k`, so `[a-z]` was not ASCII-only.
        // The needle is the "nothing found" sentence. `/host/` would match the word `host` INSIDE that sentence.
        assert.match(summarizeCommandOutput("https://a.b.te\u017ft/x"), /none of them named/u);
    });

    it("names an errno in Node's canonical `ERRNO: message` form", () => {
        // Round 4: the round 3 fix excluded `:` and `.` after an errno, which is how `node:fs` prints every one of them.
        assert.match(summarizeCommandOutput("ERR_PNPM_LINKING_FAILED  EPERM: operation not permitted, symlink"), /EPERM/u);
        assert.match(summarizeCommandOutput("Error: ENOENT: no such file or directory, open '/x/package.json'"), /ENOENT/u);
        assert.match(summarizeCommandOutput("npm ERR! E401: Unable to authenticate"), /E401/u);
        assert.match(summarizeCommandOutput("The fetch failed with ETIMEDOUT."), /ETIMEDOUT/u);
    });

    it("reads no status from a query parameter", () => {
        // Round 4: `?status=503` is a URL the client was about to CALL, and not an answer any server gave.
        assert.doesNotMatch(summarizeCommandOutput("GET https://reg.example.test/cb?status=503&token=SECRETTOKEN failed"), /HTTP 503/u);
        assert.doesNotMatch(summarizeCommandOutput("npm ERR! redirect to https://reg.example.test/x?statusCode=404"), /HTTP 404/u);
    });

    it("names the host of an indented or quoted `.npmrc` line, and of a `--registry=` argument", () => {
        // Round 4: the round 3 fix anchored the scheme-relative form at the line start alone, and left `=` out of the
        // scheme form's start rule. A diagnostic quotes an `.npmrc` line indented, and hints a registry with `=`.
        assert.match(summarizeCommandOutput("  //registry.example.test/:_authToken=SECRETTOKEN"), /host registry\.example\.test/u);
        assert.match(summarizeCommandOutput("npm ERR! config //registry.example.test/:_authToken=SECRETTOKEN"), /host registry\.example\.test/u);
        assert.match(summarizeCommandOutput("Retry with --registry=https://registry.example.test/"), /host registry\.example\.test/u);
        assert.doesNotMatch(summarizeCommandOutput("  //registry.example.test/:_authToken=SECRETTOKEN"), /SECRETTOKEN/u);
    });

    it("keeps a budget for each KIND of fact, so codes cannot crowd out the host", () => {
        // Round 4: one budget spent in scan order, and codes are scanned first.
        const manyCodes = Array.from({ length: 12 }, (_, index) => `ERR_PNPM_CODE_${"X".repeat(index + 3)}`).join("\n");

        assert.match(summarizeCommandOutput(`${manyCodes}\n ERR_PNPM_FETCH_401  GET https://registry.npmjs.org/x`), /registry\.npmjs\.org/u);
    });

    it("reads no status from a parameter that any separator carries", () => {
        // Round 5: `?` and `&` alone were not enough. The `&amp;` form is an HTML error body echoed into stderr, which
        // is exactly where a reader trusts a reported status.
        for (const text of [
            "npm ERR! GET https://registry.io/x#status=404",
            "npm ERR! GET https://registry.io/x?pkg=a;status=503",
            'npm ERR! <html><a href="/retry?p=1&amp;status=500">here</a></html>',
            "npm ERR! GET https://registry.io/-/v1/health/status=503 failed",
            "npm ERR! path /tmp/cache.status:500",
        ]) {
            assert.doesNotMatch(summarizeCommandOutput(text), /HTTP \d/u);
        }
    });

    it("reads no status from digits inside a quoted opaque value", () => {
        // Round 5: the quote separators reopened the `x-status: SECRET-503-KEY` class, because a closing quote
        // satisfied the trailing guard on its own.
        assert.doesNotMatch(summarizeCommandOutput('X-Api-Key: status="503"SECRETTAIL'), /HTTP 503/u);
        assert.doesNotMatch(summarizeCommandOutput("x-status: '429'-SECRET"), /HTTP 429/u);
        // The quoted forms a real error body uses still work.
        assert.match(summarizeCommandOutput('{"statusCode":403}'), /HTTP 403/u);
        assert.match(summarizeCommandOutput("{\"status\": '404'}"), /HTTP 404/u);
        // Four separator characters, `": "`, which is the commonest shape of a JSON error body.
        assert.match(summarizeCommandOutput('{"status": "404"}'), /HTTP 404/u);
        // The class holds punctuation and a space only, so a longer run reaches no further into an opaque value.
        assert.doesNotMatch(summarizeCommandOutput("x-status: SECRET-503-KEY"), /HTTP 503/u);
    });
});
