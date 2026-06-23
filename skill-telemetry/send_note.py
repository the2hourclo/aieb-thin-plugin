#!/usr/bin/env python3
"""
send_note.py - fire-and-forget sender for skill-feedback notes.

Part of the CLO skill-telemetry pipeline. This is the ONE thing that ships in the
plugin and leaves a client's machine: it takes a single friction/win note and POSTs
it to a Google Form's formResponse endpoint, which collects it in the creator's
linked Google Sheet. No API key, no secret - the Google Form submit URL is public
and write-only, so there is nothing sensitive to extract from the plugin.

Design rules (these matter because it runs on other people's machines):
  - Standard library ONLY (urllib). Runs on any Python 3.6+, no pip install.
  - Fail-safe: every error is swallowed, it always exits 0, it NEVER blocks a session.
  - Kill-switch: honors env CLO_TELEMETRY_OFF and config {"enabled": false}.
  - Config-driven: the form URL and field->entry mapping live in config.json, so the
    same script works for any form. Nothing form-specific is hardcoded here.

Usage:
  python send_note.py --note-file note.json
  python send_note.py --json '{"skill":"write","type":"Win","note":"nailed it"}'
  python send_note.py --skill write --type Win --note "nailed it"
  python send_note.py --note-file note.json --dry-run     # print payload, do not send
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CONFIG_PATH = os.path.join(HERE, "config.json")
TIMEOUT = 7  # seconds - short, so a slow/blocked network never stalls a hook

# The note fields we know about. The form's field_map decides which actually get sent.
KNOWN_FIELDS = ("skill", "type", "task", "what_happened", "why",
                "suggested_change", "where_in_skill", "impact",
                "install_id", "plugin_version")


def _truthy(val):
    return str(val).strip().lower() in ("1", "true", "yes", "on")


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def build_note_from_args(args):
    note = {}
    for k in KNOWN_FIELDS:
        v = getattr(args, k, None)
        if v is not None:
            note[k] = v
    return note


def main():
    p = argparse.ArgumentParser(
        description="Send one skill-feedback note to the collection form.")
    p.add_argument("--note-file", help="path to a JSON file holding the note")
    p.add_argument("--json", help="the note as an inline JSON string")
    p.add_argument("--skill")
    p.add_argument("--type", help="Friction or Win")
    p.add_argument("--task")
    p.add_argument("--what-happened", dest="what_happened")
    p.add_argument("--why")
    p.add_argument("--suggested-change", dest="suggested_change")
    p.add_argument("--where-in-skill", dest="where_in_skill")
    p.add_argument("--impact", help="low / medium / high")
    p.add_argument("--install-id", dest="install_id")
    p.add_argument("--plugin-version", dest="plugin_version")
    p.add_argument("--dry-run", action="store_true",
                   help="print what would be sent, but do not POST")
    p.add_argument("--config", default=DEFAULT_CONFIG_PATH,
                   help="path to config.json (defaults to the one beside this script)")
    args = p.parse_args()

    # --- Kill-switch (environment) - checked before doing any work ---
    if _truthy(os.environ.get("CLO_TELEMETRY_OFF", "")):
        print("[send_note] disabled via CLO_TELEMETRY_OFF - skipping.")
        return 0

    # --- Load config (fail-safe) ---
    try:
        cfg = load_config(args.config)
    except Exception as e:
        print("[send_note] no/invalid config.json - skipping (%s)" % e)
        return 0

    if not cfg.get("enabled", True):
        print("[send_note] disabled in config - skipping.")
        return 0

    action_url = (cfg.get("form_action_url") or "").strip()
    field_map = cfg.get("field_map") or {}
    if not action_url or action_url.startswith("REPLACE_") or not field_map:
        print("[send_note] form not configured yet "
              "(form_action_url / field_map are placeholders) - skipping.")
        return 0

    # --- Consent gate (opt-in). Once the consent flow has initialized
    #     (.state/install.json exists), only send if the user granted. No file
    #     => dev/creator mode, gated by config "enabled" only. ---
    install = _read_json(os.path.join(os.path.expanduser("~"), ".clo-skill-telemetry", "install.json"))
    if install and install.get("consent") != "granted":
        print("[send_note] not opted in (consent=%s) - skipping."
              % install.get("consent", "pending"))
        return 0

    # --- Assemble the note from whichever input was provided ---
    note = {}
    try:
        if args.note_file:
            with open(args.note_file, "r", encoding="utf-8") as f:
                note = json.load(f)
        elif args.json:
            note = json.loads(args.json)
        else:
            note = build_note_from_args(args)
    except Exception as e:
        print("[send_note] could not read note (%s) - skipping." % e)
        return 0

    if not note:
        print("[send_note] empty note - nothing to send.")
        return 0

    # --- Fill install_id / plugin_version from config defaults if omitted ---
    # so callers (commands, reviewer agent) don't have to know them.
    for k in ("install_id", "plugin_version"):
        if not note.get(k) and cfg.get(k):
            note[k] = cfg[k]
    if not note.get("install_id") and install.get("install_id"):
        note["install_id"] = install["install_id"]  # prefer the anonymous install id

    # --- Map note keys -> Google Form entry IDs ---
    payload = {}
    for key, entry_id in field_map.items():
        if key in note and note[key] is not None and str(note[key]) != "":
            payload[entry_id] = str(note[key])

    if not payload:
        print("[send_note] note had no mappable fields - skipping.")
        return 0

    data = urllib.parse.urlencode(payload).encode("utf-8")

    if args.dry_run:
        print("[send_note] DRY RUN - would POST to:\n  %s\n  %s"
              % (action_url, json.dumps(payload, indent=2)))
        return 0

    # --- Fire-and-forget POST. Any failure is swallowed by design. ---
    try:
        req = urllib.request.Request(
            action_url,
            data=data,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "clo-skill-telemetry/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            code = resp.getcode()
        # Google Forms returns HTTP 200 on a successful submit. We treat the POST
        # as best-effort: a non-200 is logged but never raised.
        print("[send_note] sent (HTTP %s)." % code)
    except Exception as e:
        print("[send_note] send failed (%s) - ignored." % e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
