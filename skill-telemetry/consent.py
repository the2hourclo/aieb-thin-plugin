#!/usr/bin/env python3
"""
consent.py - SessionStart hook for the skill-telemetry loop (client side).

Two model-free, fail-safe jobs:
  1. First run: generate an anonymous install id and ask the user (once) to OPT IN
     to anonymized skill feedback. Nothing is ever sent until they say yes.
  2. After opt-in: if unreviewed skill-using sessions are queued, nudge the user to
     run a quick review (which sends distilled Friction/Win notes - never content).

State: <here>/.state/install.json = {"install_id": "...", "consent": "pending|granted|denied"}.

Flags:
  (none)     SessionStart mode: ensure install id, print the consent ask or the nudge.
  --grant    record opt-in  (consent=granted).
  --deny     record opt-out (consent=denied).
  --status   print current state as JSON.

Kill-switch: env CLO_TELEMETRY_OFF or config {"enabled": false} -> stay silent.
"""
import json
import os
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
# State must live in a WRITABLE location - the plugin folder is read-only on a
# buyer's machine. Home dir is writable and shared across plugins (one install
# id + consent + inbox per machine). config.json is read-only, ships in plugin.
STATE_DIR = os.path.join(os.path.expanduser("~"), ".clo-skill-telemetry")
INSTALL = os.path.join(STATE_DIR, "install.json")
INBOX = os.path.join(STATE_DIR, "inbox.json")
CONFIG = os.path.join(HERE, "config.json")


def _truthy(v):
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _disabled():
    if _truthy(os.environ.get("CLO_TELEMETRY_OFF", "")):
        return True
    try:
        with open(CONFIG, encoding="utf-8") as f:
            if not json.load(f).get("enabled", True):
                return True
    except Exception:
        pass
    return False


def _load():
    try:
        with open(INSTALL, encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save(d):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = INSTALL + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2)
    os.replace(tmp, INSTALL)


def _ensure():
    d = _load()
    if not d.get("install_id"):
        d["install_id"] = uuid.uuid4().hex
        d.setdefault("consent", "pending")
        _save(d)
    return d


def _unreviewed_count():
    try:
        with open(INBOX, encoding="utf-8") as f:
            return sum(1 for e in json.load(f) if e.get("status") == "unreviewed")
    except Exception:
        return 0


def main():
    try:
        arg = sys.argv[1] if len(sys.argv) > 1 else ""

        if arg == "--grant":
            d = _ensure(); d["consent"] = "granted"; _save(d)
            print("Skill-feedback opt-in recorded. Thank you - distilled "
                  "Friction/Win notes will help these skills improve for everyone.")
            return 0
        if arg == "--deny":
            d = _ensure(); d["consent"] = "denied"; _save(d)
            print("Skill-feedback stays OFF. Nothing will be sent.")
            return 0
        if arg == "--status":
            print(json.dumps(_ensure(), indent=2))
            return 0

        # --- SessionStart mode ---
        if _disabled():
            return 0
        d = _ensure()
        consent = d.get("consent", "pending")

        if consent == "pending":
            print(
                "[skill-telemetry] First run. This plugin can send the author "
                "ANONYMIZED skill feedback - which skills work well, which struggle, "
                "and the strategies that worked - so the skills keep improving for "
                "everyone. It NEVER sends your transcripts, files, or any content; "
                "only short distilled notes tied to an anonymous install id, and only "
                "when you choose to run a review. It is OFF until you opt in.\n"
                "ACTION FOR CLAUDE: ask the user once, plainly - 'Opt in to anonymized "
                "skill-feedback so the plugin author can keep improving these skills? "
                "(yes/no)'. On yes, run:  python \"" + os.path.join(HERE, "consent.py")
                + "\" --grant   On no, run the same with --deny. Then continue normally."
            )
            return 0

        if consent == "granted":
            n = _unreviewed_count()
            if n > 0:
                print(
                    "[skill-telemetry] You have %d skill-using session(s) not yet "
                    "reviewed. Offer ONCE: 'Want me to review them for skill "
                    "improvements?' On yes, run the `telemetry-reviewer` agent on each "
                    "queued transcript listed in ~/.clo-skill-telemetry/inbox.json (it sends distilled "
                    "Friction/Win notes, never content), then mark them reviewed. If "
                    "declined, stay silent." % n
                )
            return 0

        return 0  # denied -> silent
    except Exception:
        return 0


if __name__ == "__main__":
    sys.exit(main())
