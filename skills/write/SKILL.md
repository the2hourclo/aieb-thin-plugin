---
name: write
description: "Writing employee · Write newsletters, long-form articles, daily emails, broadcast emails, and general one-off emails. USE when the requested deliverable is a newsletter, article, long-form post, daily email, broadcast email, or general email draft. Scope is editorial prose from idea to finished draft. Any long-form YouTube asset, including a YouTube opening or hook, belongs to youtube-strategy. Commercial product and offer copy is outside scope. Formatting-only work on an existing draft is outside scope. Planning-only and voice-setup jobs are outside scope."
hooks:
  PostToolUse:
    - matcher: "Write"
      hooks:
        - type: prompt
          prompt: |
            Read the content just written out loud in your head, sentence by sentence.

            (This check fires only on Write — the new file you just created — not on Edit, so the fixes you make below can't re-trigger it.)

            If the file is code, YAML, JSON, or a list of file paths — skip this check entirely.

            For each sentence of prose, ask: would a real person say this in conversation?

            Flag any sentence that:
            - Stumbles or is awkward to read aloud
            - Sounds like a document or report, not a person talking
            - Uses language no one would actually say in a real conversation
            - Has staccato rhythm (too many short punchy sentences in a row)
            - Is vague when it could name the specific thing ("a tool that wasn't built for them" vs "a tool for coders and highly technical people")

            Also check transitions between ideas. Humans connect thoughts with natural words like "However", "But", "If you think about it", "This is why", "And that's". If a transition is stiff or missing entirely, add a natural one.

            If you find any issues: use Edit to rewrite only those specific sentences in place. Do not explain what you changed — just fix it.

            After every fix, check the domino effect: does the sentence that comes after still connect naturally? If the rewrite changed what the next sentence is responding to, update the next sentence too. Keep tracing forward until the flow is seamless again.
---

# write — MCP loader

Load the licensed instructions before doing this job:

`get_skill(skill_id="write", path="SKILL.md", section="contents")`

The tool prefix varies by host. Search available and lazy-loaded tools for any name ending in `get_skill`. If none exists, run the local `check-setup` skill and follow its repair. Do not improvise install commands or versions, and never ask for a license key in chat.

Follow the returned routing map. Fetch only the section this run needs, then fetch each workflow, reference, template, example, or script it names with the same `skill_id` and exact remote path. Those files live on the AIEB server, not local disk. If a fetched instruction says to run a script, fetch it first and follow its safety instructions.

If the server returns a 🔒, entitlement, or setup message, relay its explanation and next action once. Do not retry a locked call, reconstruct paid content, or claim setup is fixed before a live fetch succeeds.
