/**
 * BR-169 — Super Admin Recruit AI v2 certification presentation helpers.
 */

export function canEnableRecruitAiV2(tenant) {
  return Boolean(tenant?.certified) && tenant?.suspended !== true;
}

export function recruitAiV2StatusLabel(tenant) {
  if (tenant?.suspended) {
    return "Suspended — fail closed";
  }
  if (tenant?.enabled && tenant?.certified) {
    return "Certified and enabled";
  }
  if (tenant?.certified) {
    return "Certified — not enabled";
  }
  return "Not certified (default off)";
}
