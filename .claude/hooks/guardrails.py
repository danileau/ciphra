#!/usr/bin/env python3
"""
ciphra guardrail hook — mechanical enforcement of the hard rules that used to
live only in a human's head (or an assistant's memory). Wired as a PreToolUse
hook for Read / Edit / Write / Bash in .claude/settings.json.

Two concerns, one script:

  1. SECRET FILES — never read a whole age/ssh/gpg key or a live .env into the
     transcript. We leaked ciphra's age private key into context once, which
     forced a key rotation. Grepping a public key out is still allowed.

  2. PROD-MUTATING COMMANDS — the operator merges and deploys, never the
     assistant. Blocks `gh pr merge --admin`, direct pushes to main, deploy-tag
     pushes (`git push … deploy-*`), and ssh/scp/sftp to the VPS. Deploys here
     are pull-based (operator pushes a `deploy-<sha>` tag; the VPS timer pulls),
     so nothing in this repo legitimately needs SSH.

Contract: read the tool call as JSON on stdin. Exit 0 = allow. Exit 2 = block
(the message on stderr is shown to the model so it self-corrects). Any parse
error fails OPEN (exit 0) — a broken guard must never wedge the session; the
human rules still apply as backstop.
"""
import json
import re
import sys

# ── Secret material: file paths that must never be read wholesale ───────────
SECRET_PATH = re.compile(
    r"""(
        \.age$ | \.key$ | \.pem$ | \.gpg$ | \.p12$ | \.pfx$ |
        (^|/)id_(rsa|ed25519|ecdsa|dsa)($|[^/]*$) |     # ssh private keys
        (^|/)keyfile($|[^/]*) |
        (^|/)\.env(\.|$)                                # .env, .env.local, …
    )""",
    re.VERBOSE,
)
# …but these env templates are safe (no real secrets, committed on purpose).
SECRET_ALLOW = re.compile(r"\.env\.(example|sample|template|docker\.example)")

# Shell readers that would dump a whole file into the transcript.
DUMP = re.compile(r"\b(cat|head|tail|less|more|bat|xxd|od|strings|base64)\b")

# ── Prod-mutating command patterns (operator-only) ──────────────────────────
# Matched against the command with quoted strings blanked out (see strip_quotes),
# so a commit message / echo / grep pattern that merely *mentions* these words is
# not mistaken for an actual invocation.
PROD_RULES = [
    (re.compile(r"\bgh\s+pr\s+merge\b[^\n]*--admin\b"),
     "gh pr merge --admin bypasses the main-protection review rule. The OPERATOR "
     "merges (with --admin if they choose). Push the branch + open/leave the PR."),
    (re.compile(r"\bgit\s+push\b[^\n]*?(\borigin\b\s+)?(HEAD:)?main(\s|:|$)"),
     "Direct push to origin/main is blocked — main is protected. Open a PR; the "
     "operator merges."),
    (re.compile(r"\bgit\s+push\b[^\n]*\bdeploy-"),
     "Pushing a deploy-<sha> tag triggers the prod deploy. That is the operator's "
     "action — prepare the `git tag … && git push origin deploy-<sha>` command and "
     "hand it over."),
    # ssh/scp/sftp only when it's the verb of a (sub)command, not a substring.
    (re.compile(r"(?:^|[;&|]|\n)\s*(?:sudo\s+)?(?:ssh|scp|sftp)\b"),
     "SSH/SCP to the VPS is blocked — the assistant never touches prod state. "
     "Deploys are pull-based (operator pushes a deploy tag; the VPS pulls)."),
]


def strip_quotes(s: str) -> str:
    """Blank single/double-quoted spans so words inside string literals (commit
    messages, echo text, grep patterns) aren't read as command invocations."""
    s = re.sub(r"'[^']*'", " ", s)
    s = re.sub(r'"[^"]*"', " ", s)
    return s


def block(reason: str) -> None:
    sys.stderr.write("⛔ ciphra guardrail: " + reason + "\n")
    sys.exit(2)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # fail open — never wedge the session on a parse error

    tool = data.get("tool_name", "")
    ti = data.get("tool_input", {}) or {}

    # 1. Secret-file protection on file tools.
    if tool in ("Read", "Edit", "Write"):
        path = str(ti.get("file_path", "") or ti.get("path", ""))
        if path and SECRET_PATH.search(path) and not SECRET_ALLOW.search(path):
            block(
                f"'{path}' looks like secret key material or a live .env. Reading it "
                "wholesale risks leaking it into the transcript. Extract only what you "
                "need (e.g. `grep 'public key' …`) or use a template file."
            )

    # 2. Bash: secret dumps + prod-mutating commands.
    if tool == "Bash":
        cmd = str(ti.get("command", ""))
        code = strip_quotes(cmd)  # verb detection ignores quoted string literals
        for rule, reason in PROD_RULES:
            if rule.search(code):
                block(reason)
        # Dump verb must be a real command (checked on `code`), but the secret
        # path it targets may itself be quoted — so scan the ORIGINAL tokens.
        if DUMP.search(code):
            for tok in re.split(r"[\s'\"=]+", cmd):
                if tok and SECRET_PATH.search(tok) and not SECRET_ALLOW.search(tok):
                    block(
                        f"Dumping '{tok}' would print secret material into the "
                        "transcript. Use a key-only extractor like `grep 'public key'`."
                    )

    sys.exit(0)


if __name__ == "__main__":
    main()
