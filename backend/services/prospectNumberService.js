/**
 * Sprint 10.1 — Human-readable prospect numbers (TV-000001).
 */

const { supabase } = require("./supabaseService");

const PREFIX = "TV-";
const PAD_LENGTH = 6;

function formatProspectNumber(sequence) {
  return `${PREFIX}${String(sequence).padStart(PAD_LENGTH, "0")}`;
}

function parseProspectNumber(value) {
  if (!value || !String(value).startsWith(PREFIX)) {
    return 0;
  }

  const numeric = Number.parseInt(String(value).slice(PREFIX.length), 10);
  return Number.isNaN(numeric) ? 0 : numeric;
}

async function generateNextProspectNumber() {
  const { data, error } = await supabase
    .from("prospects")
    .select("prospect_number")
    .not("prospect_number", "is", null)
    .like("prospect_number", `${PREFIX}%`)
    .order("prospect_number", { ascending: false })
    .limit(1);

  if (error) {
    if (error.code === "42703") {
      return formatProspectNumber(1);
    }

    throw error;
  }

  const latest = data?.[0]?.prospect_number;
  const next = parseProspectNumber(latest) + 1;
  return formatProspectNumber(next);
}

module.exports = {
  formatProspectNumber,
  parseProspectNumber,
  generateNextProspectNumber,
  PREFIX
};
