import crypto from "node:crypto";

const sha = (content) => crypto.createHash("sha256").update(content).digest("hex");
export const goalHash = (goal) => goal && typeof goal === "object" ? sha(JSON.stringify(goal)) : null;
const latestAnswers = (record) => {
  const latest = new Map();
  for (const item of record.answers || []) {
    const prior = latest.get(item.key);
    if (!prior || (item.confirmed_at_revision ?? 0) >= (prior.confirmed_at_revision ?? 0)) latest.set(item.key, item);
  }
  return latest;
};
const answer = (record, key) => {
  const item = latestAnswers(record).get(key);
  return item?.provenance === "inferred_unconfirmed" ? null : item?.value ?? null;
};

export function validateBrief(record, { assets = {}, currentGoalHash = goalHash(record.goal) } = {}) {
  const gaps = [];
  if (answer(record, "review_mode") !== "check_before_send") gaps.push("review_mode_not_draft_first");
  if (!record.rung) gaps.push("missing_rung_decision");
  if (record.outstanding_question?.required) gaps.push("required_question_outstanding");
  for (const item of latestAnswers(record).values()) if (item.provenance === "inferred_unconfirmed") gaps.push(`unconfirmed_answer:${item.key}`);
  const materialRevision = record.material_revision ?? Math.max(1, ...(record.asset_refs || []).map((ref) =>
    ref.read_evidence?.read_at_revision || 0));
  const confirmation = record.rung?.evidence?.find((entry) => entry.kind === "goal_confirmation"
    && entry.content_sha256 === currentGoalHash && entry.observed_at_revision >= materialRevision);
  if (record.rung && (!confirmation || confirmation.observed_at_revision > record.revision)) gaps.push("stale_confirmation");
  for (const ref of record.asset_refs || []) {
    const current = assets[ref.asset_id];
    if (!ref.asset_id || !ref.path || !current?.readable) gaps.push(`invalid_or_unread_asset:${ref.asset_id || "unknown"}`);
    else if (!ref.read_evidence?.content_sha256 || ref.read_evidence.content_sha256 !== current.content_sha256
      || ref.read_evidence.read_at_revision > record.revision) {
      gaps.push(`stale_asset:${ref.asset_id}`);
      if (record.rung && !gaps.includes("stale_confirmation")) gaps.push("stale_confirmation");
    }
  }
  if (record.rung?.kind === "system") {
    const prerequisites = record.rung.evidence?.some((entry) => entry.kind === "working_skills"
      && entry.content_sha256 && entry.observed_at_revision <= record.revision);
    const override = record.rung.override?.requested_by_member === true
      && record.rung.override.at_revision >= record.rung.decided_at_revision
      && record.rung.override.at_revision >= materialRevision
      && record.rung.override.at_revision <= record.revision;
    if (!prerequisites && !override) gaps.push("system_prerequisite_missing");
  }
  return { ok: gaps.length === 0, gaps };
}

export function briefFromBuild(record, options = {}) {
  const checked = validateBrief(record, options);
  return { valid: checked.ok, origin: "front_door", job: answer(record, "job") || record.goal?.normalized || null,
    trigger: answer(record, "trigger"), method: answer(record, "method"), result: answer(record, "result"),
    rules: answer(record, "rules"), exceptions: answer(record, "exceptions"),
    review_mode: answer(record, "review_mode"), assets: record.asset_refs || [],
    examples: (record.asset_refs || []).filter((item) => item.role === "example"), rung: record.rung,
    unresolved_gaps: checked.gaps, confirmation_evidence: record.rung?.evidence || [],
    resume_limited: record.storage?.mode === "restricted" };
}
