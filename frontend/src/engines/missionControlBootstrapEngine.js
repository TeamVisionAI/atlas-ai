/**
 * Mission Control first-paint bootstrap (no I/O, no tenant identity).
 * Deep-linked phone/prospect must not wait for the org-wide dashboard queue.
 */

export function planMissionControlBootstrap({ deepLinkPhone = null } = {}) {
  const focusPhone = String(deepLinkPhone || "").trim();

  if (focusPhone) {
    return {
      mode: "deep_link",
      focusPhone,
      critical: ["getMissionControl", "getOrganizationSettings"],
      deferred: ["getDashboard"]
    };
  }

  return {
    mode: "queue",
    focusPhone: null,
    critical: ["getDashboard", "getOrganizationSettings"],
    deferred: ["getMissionControl"]
  };
}

export function shouldHoldMissionControlSplash({ initialLoading, workspace } = {}) {
  return Boolean(initialLoading) && !workspace;
}

/**
 * Splash wait is the slowest critical request, not critical + deferred dashboard.
 * Durations are test/local estimates only — not logged in production.
 */
export function estimateSplashWaitMs(plan, durations = {}) {
  const names = plan?.critical?.length ? plan.critical : [];
  if (!names.length) {
    return 0;
  }
  return Math.max(...names.map((name) => Number(durations[name]) || 0));
}
