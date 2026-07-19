// Test the minimal YAML parser + state helpers against the exact progress-state.yaml
// schema from strategy/plans/2026-07-16-business-ontology-spec.md. Run: node state.test.mjs
import assert from "node:assert";
import { parseYaml, onboardingComplete, ladderUnfinished, nextNudge } from "./state.mjs";

const SAMPLE = `# progress-state.yaml — single source of truth
version: 2
last_updated: 2026-07-16          # each writing skill stamps this

business:
  name: "Online Fitness Coaching"
  archetype: coach                # coach | course_creator | agency | ...
  price_range: "$1,500-$5,000"
  team_size: "Solo + 1 VA"

onboarding:
  started_at: 2026-07-16
  completed_at: 2026-07-16        # null until X-Ray finishes

health:
  leverage_score: 41              # %
  weakest: Methodology
  assets:
    - { name: Content,       category: ip,      score: yellow, tier: critical }
    - { name: Methodology,   category: ip,      score: red,    tier: critical }
    - { name: "M&S Systems", category: systems, score: red,    tier: critical }

roadmap:
  - id: r1
    build: "Content Employee"
    type: skill_system
    why: "Methodology red + content eats 15 hrs/wk"
    automates: proc-content
    runs_on: [Content, Methodology]
    needs_tools: [notion]
    blueprint: drilled
    autonomy: build
    status: pending
  - id: r2
    build: "Onboarding Employee"
    type: skill_system
    why: "delivery is manual + inconsistent"
    automates: proc-onboarding
    runs_on: ["Operations Systems"]
    needs_tools: [notion]
    blueprint: needs_drill
    autonomy: build
    status: pending

ladder:
  1-onboard: done
  2-map: done
  3-first-skill: in_progress
  4-system: pending
  5-autonomy: pending

built:
  skills: [write, perspective-shift]
  skill_systems: []
  agents: []
  commands: []
  routing_configured: false
  tools_connected: [notion]
  connectors: []

next:
  build: r1
  ready: true
  blocker: null
  say: "Methodology is your weakest asset. I can build your Content Employee now — it takes over your content process. Want me to go?"
`;

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

const s = parseYaml(SAMPLE);

check("top scalars", () => {
  assert.strictEqual(s.version, 2);
  assert.strictEqual(s.last_updated, "2026-07-16");
});
check("business map (quoted strings, bare enum)", () => {
  assert.strictEqual(s.business.name, "Online Fitness Coaching");
  assert.strictEqual(s.business.archetype, "coach");
  assert.strictEqual(s.business.price_range, "$1,500-$5,000");
});
check("onboarding.completed_at present", () => {
  assert.strictEqual(s.onboarding.completed_at, "2026-07-16");
  assert.strictEqual(onboardingComplete(s), true);
});
check("health: number + flow-map list", () => {
  assert.strictEqual(s.health.leverage_score, 41);
  assert.strictEqual(s.health.weakest, "Methodology");
  assert.strictEqual(s.health.assets.length, 3);
  assert.strictEqual(s.health.assets[0].name, "Content");
  assert.strictEqual(s.health.assets[2].name, "M&S Systems"); // quoted, has space
  assert.strictEqual(s.health.assets[1].score, "red");
});
check("roadmap: block list of maps with flow-list values", () => {
  assert.strictEqual(s.roadmap.length, 2);
  assert.strictEqual(s.roadmap[0].id, "r1");
  assert.strictEqual(s.roadmap[0].build, "Content Employee");
  assert.deepStrictEqual(s.roadmap[0].runs_on, ["Content", "Methodology"]);
  assert.deepStrictEqual(s.roadmap[1].runs_on, ["Operations Systems"]);
  assert.strictEqual(s.roadmap[0].autonomy, "build");
  assert.strictEqual(s.roadmap[1].blueprint, "needs_drill");
});
check("ladder: map of stage→status", () => {
  assert.strictEqual(s.ladder["1-onboard"], "done");
  assert.strictEqual(s.ladder["3-first-skill"], "in_progress");
  assert.strictEqual(s.ladder["5-autonomy"], "pending");
});
check("built: flow lists + boolean + empty lists", () => {
  assert.deepStrictEqual(s.built.skills, ["write", "perspective-shift"]);
  assert.strictEqual(s.built.routing_configured, false);
  assert.deepStrictEqual(s.built.connectors, []);
  assert.deepStrictEqual(s.built.tools_connected, ["notion"]);
});
check("next: bool, null, long quoted string", () => {
  assert.strictEqual(s.next.build, "r1");
  assert.strictEqual(s.next.ready, true);
  assert.strictEqual(s.next.blocker, null);
  assert.ok(s.next.say.startsWith("Methodology is your weakest asset"));
  assert.ok(s.next.say.includes("—")); // em-dash survived
});

check("ladderUnfinished true (stages pending)", () => {
  assert.strictEqual(ladderUnfinished(s), true);
});
check("nextNudge: ready to build, speaks next.say", () => {
  const n = nextNudge(s);
  assert.strictEqual(n.hasWork, true);
  assert.strictEqual(n.ready, true);
  assert.strictEqual(n.blocker, null);
  assert.ok(n.say.startsWith("Methodology"));
  assert.strictEqual(n.item.id, "r1");
});

// blocker path: not ready → surface the blocker
check("nextNudge: blocker set → not ready", () => {
  const withBlocker = parseYaml(SAMPLE.replace("blocker: null", 'blocker: "youtube connector not wired"'));
  const n = nextNudge(withBlocker);
  assert.strictEqual(n.ready, false);
  assert.strictEqual(n.blocker, "youtube connector not wired");
});
// pre-onboarding: completed_at null → onboardingComplete false
check("onboardingComplete false when completed_at null", () => {
  const fresh = parseYaml(SAMPLE.replace("completed_at: 2026-07-16", "completed_at: null"));
  assert.strictEqual(onboardingComplete(fresh), false);
});
// all ladder done → ladderUnfinished false
check("ladderUnfinished false when all done/skipped", () => {
  const done = parseYaml(SAMPLE
    .replace("3-first-skill: in_progress", "3-first-skill: done")
    .replace("4-system: pending", "4-system: skipped")
    .replace("5-autonomy: pending", "5-autonomy: done"));
  assert.strictEqual(ladderUnfinished(done), false);
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures above)" : ""}`);
