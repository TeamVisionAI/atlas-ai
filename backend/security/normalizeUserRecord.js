/**
 * Sprint 16.9 — Normalize user records from users or atlas_users into a common auth shape.
 */

function normalizeUserRecord(user) {
  if (!user) {
    return null;
  }

  const name = user.display_name || user.name || "";
  const nameParts = String(name).trim().split(/\s+/);

  return {
    ...user,
    display_name: user.display_name || user.name || name,
    first_name: user.first_name || nameParts[0] || "",
    last_name: user.last_name || nameParts.slice(1).join(" ") || "",
    status:
      user.status ||
      (typeof user.is_active === "boolean" ? (user.is_active ? "active" : "suspended") : "active"),
    last_login_at: user.last_login_at || user.last_login || null
  };
}

module.exports = {
  normalizeUserRecord
};
