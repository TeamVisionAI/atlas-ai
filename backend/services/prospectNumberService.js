/**
 * Tenant-scoped human-readable prospect numbers (TV-000001, TL-000001, …).
 * Prefix is derived from the record organization — never DEFAULT_ORGANIZATION_ID.
 * organization_id remains authoritative; do not infer org from the prefix.
 */

const { supabase } = require("./supabaseService");

const PAD_LENGTH = 6;
const GENERIC_PREFIX = "TN";

function slugifyOrganizationName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Derive a 2–6 character prefix from org config, slug, or name.
 * team-vision → TV, team-legacy → TL, acme → AC.
 */
function deriveProspectNumberPrefix(organization = {}) {
  const configured = String(
    organization.prospect_number_prefix ||
      organization.prospectNumberPrefix ||
      ""
  )
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (configured.length >= 2 && configured.length <= 6) {
    return configured;
  }

  const slug = String(organization.slug || slugifyOrganizationName(organization.name) || "")
    .trim()
    .toLowerCase();
  const parts = slug.split(/[^a-z0-9]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  if (parts[0] && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const nameParts = String(organization.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (nameParts.length >= 2) {
    return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
  }
  if (nameParts[0] && nameParts[0].length >= 2) {
    return nameParts[0].slice(0, 2).toUpperCase();
  }

  return GENERIC_PREFIX;
}

function formatProspectNumber(sequence, prefix = GENERIC_PREFIX) {
  const normalized = String(prefix || GENERIC_PREFIX)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || GENERIC_PREFIX;
  return `${normalized}-${String(sequence).padStart(PAD_LENGTH, "0")}`;
}

function parseProspectNumber(value, prefix = null) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) {
    return 0;
  }

  const expected = prefix
    ? `${String(prefix).trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}-`
    : null;
  if (expected && !raw.startsWith(expected)) {
    return 0;
  }

  const numericPart = raw.includes("-") ? raw.slice(raw.lastIndexOf("-") + 1) : raw;
  const numeric = Number.parseInt(numericPart, 10);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function prospectNumberMatchesOrganization(prospectNumber, organization) {
  const prefix = deriveProspectNumberPrefix(organization);
  return String(prospectNumber || "")
    .trim()
    .toUpperCase()
    .startsWith(`${prefix}-`);
}

async function loadOrganizationForPrefix(organizationId, loader) {
  if (typeof loader === "function") {
    return loader(organizationId);
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug, name")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      const fallback = await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", organizationId)
        .maybeSingle();
      if (fallback.error || !fallback.data) {
        throw new Error(
          "Refusing to generate a prospect number without the record organization."
        );
      }
      return fallback.data;
    }
    throw error;
  }

  if (!data) {
    throw new Error(
      "Refusing to generate a prospect number without the record organization."
    );
  }

  return data;
}

/**
 * @param {string} organizationId — required. Never falls back to DEFAULT_ORGANIZATION_ID.
 * @param {{ organization?: object, loadOrganization?: Function }} [options]
 */
async function generateNextProspectNumber(organizationId, options = {}) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) {
    throw new Error("organizationId is required to generate a prospect number");
  }

  const organization =
    options.organization || (await loadOrganizationForPrefix(orgId, options.loadOrganization));
  const prefix = deriveProspectNumberPrefix(organization);
  const likePattern = `${prefix}-%`;

  if (typeof options.queryLatest === "function") {
    const latest = await options.queryLatest({ organizationId: orgId, prefix });
    return formatProspectNumber(parseProspectNumber(latest, prefix) + 1, prefix);
  }

  let query = supabase
    .from("prospects")
    .select("prospect_number")
    .eq("organization_id", orgId)
    .not("prospect_number", "is", null)
    .like("prospect_number", likePattern)
    .order("prospect_number", { ascending: false })
    .limit(1);

  const { data, error } = await query;

  if (error) {
    if (error.code === "42703") {
      return formatProspectNumber(1, prefix);
    }
    throw error;
  }

  const latest = data?.[0]?.prospect_number;
  const next = parseProspectNumber(latest, prefix) + 1;
  return formatProspectNumber(next, prefix);
}

module.exports = {
  deriveProspectNumberPrefix,
  formatProspectNumber,
  parseProspectNumber,
  generateNextProspectNumber,
  prospectNumberMatchesOrganization,
  GENERIC_PREFIX,
  /** @deprecated Hardcoded TV prefix — do not use for new identity. */
  PREFIX: "TV-"
};
