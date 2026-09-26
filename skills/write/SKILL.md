---
name: write
description: "Writing employee · Write newsletters, long-form articles, daily emails, broadcast emails, and general one-off emails. USE when the requested deliverable is a newsletter, article, long-form post, daily email, broadcast email, or general email draft. Scope is editorial prose from idea to finished draft. Any long-form YouTube asset, including a YouTube opening or hook, belongs to youtube-strategy. Commercial product and offer copy is outside scope. Formatting-only work on an existing draft is outside scope. Planning-only and voice-setup jobs are outside scope."
workflows:
  write-email: "One-off, daily, or broadcast editorial email"
  write-email-series: "Several distinct editorial emails from one source"
  newsletter: "Newsletter or article"
  revise-content: "Diagnose or revise existing editorial prose"
  deliver-email: "Format, validate, and save approved email prose"
  subject-line-fallback: "Three faithful options when headline is unavailable"
  finalize-artifact: "Risk-matched validation and artifact-only delivery"
hooks:
  Stop:
    - hooks:
        - type: command
          timeout: 10
          statusMessage: "Checking final response boundary"
          command: node
          args:
            - "-e"
            - >-
              const fs=require('fs'),p=require('path');let roots=[process.env.CLAUDE_SKILL_DIR,process.env.CLAUDE_PLUGIN_ROOT&&p.join(process.env.CLAUDE_PLUGIN_ROOT,'skills','write'),process.env.CLAUDE_PROJECT_DIR&&p.join(process.env.CLAUDE_PROJECT_DIR,'.claude','skills','write'),process.env.CLAUDE_PROJECT_DIR&&p.join(process.env.CLAUDE_PROJECT_DIR,'.agents','skills','write')].filter(Boolean);for(let d=process.cwd();;){roots.push(p.join(d,'.claude','skills','write'),p.join(d,'.agents','skills','write'));const up=p.dirname(d);if(up===d)break;d=up;}const script=roots.map(root=>p.join(root,'scripts','write-stop-hook.js')).find(candidate=>fs.existsSync(candidate));if(script)require(script);else process.stdout.write(JSON.stringify({decision:'block',reason:'Write final-response gate is unavailable because its bundled helper could not be resolved.'}));
---

# write — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="write", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
