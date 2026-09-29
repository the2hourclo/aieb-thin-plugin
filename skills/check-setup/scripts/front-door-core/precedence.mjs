// Pure and vendorable: hooks and fetched workflows use this exact decision.
export function resumePrecedence({ explicitRequest = null, build = null, now = new Date(), onboarding = null, roadmap = null } = {}) {
  if (explicitRequest) return { source: "explicit_request", action: explicitRequest };
  if (build && ["active", "awaiting_answer", "blocked"].includes(build.status)) {
    const updated = Date.parse(build.updated_at);
    if (!Number.isFinite(updated) || updated > now.getTime()) return { source: "build", action: "invalid_timestamp" };
    if (now.getTime() - updated >= 14 * 86400000) return { source: "build", action: "revalidate_resume_or_park" };
    return { source: "build", action: build.status === "blocked" ? "resume_or_park_blocked" : "resume", suppress_nudges: true };
  }
  if (onboarding?.next_action) return { source: "onboarding", action: onboarding.next_action };
  if (roadmap?.next_action) return { source: "roadmap", action: roadmap.next_action };
  return { source: "none", action: "none" };
}
