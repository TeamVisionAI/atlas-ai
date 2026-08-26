/**
 * BR-159 — Read-only (default) Team Legacy prospect promotion audit.
 * Usage:
 *   node backend/dev/tools/auditTeamLegacyProspectPromotion.js
 *   node backend/dev/tools/auditTeamLegacyProspectPromotion.js --apply
 *
 * --apply de-promotes unambiguously misclassified personal/unknown rows
 * (workflow_state.prospectPromotion.operational=false) and remints TV-
 * prospect_number values on genuine Legacy operational prospects to TL-.
 * Does not delete rows.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "../../../.env") });

const { supabase } = require("../../services/supabaseService");
const {
  evaluateOperationalProspectRecord,
  buildDepromotionPatch
} = require("../../core/prospectPromotionEligibility");
const {
  deriveProspectNumberPrefix,
  generateNextProspectNumber
} = require("../../services/prospectNumberService");
const { savePersistedWorkflowState } = require("../../core/workflowStateStore");

const TEAM_LEGACY = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const CANARY_NAMES = ["gaby", "sebastian r", "sebastian", "any"];

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function classifyRow(row) {
  const evaluation = evaluateOperationalProspectRecord(row, row.workflow_state || {});
  const source = upper(row.source);
  const entry = upper(row.entry_method);
  const unknown =
    (!source || source === "UNKNOWN") && (!entry || entry === "UNATTRIBUTED");
  const tvPrefixed = String(row.prospect_number || "").toUpperCase().startsWith("TV-");

  let classification = "genuine_legacy_prospect";
  if (evaluation.reason === "EXPLICITLY_DEPROMOTED") {
    classification = "depromoted_contact_preserved";
  } else if (!evaluation.operational && unknown) {
    classification = "personal_unknown_incorrectly_promoted";
  } else if (!evaluation.operational) {
    classification = "non_operational_other";
  } else if (tvPrefixed) {
    classification = "genuine_legacy_wrong_tv_prefix";
  }

  return {
    classification,
    operational: evaluation.operational,
    reason: evaluation.reason,
    tvPrefixed
  };
}

function summarize(row, extra) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    prospect_number: row.prospect_number,
    organization_id: row.organization_id,
    owner_user_id: row.owner_user_id,
    source: row.source,
    entry_method: row.entry_method,
    status: row.status,
    current_step: row.current_step,
    created_at: row.created_at,
    atlasEligibilitySource: row.workflow_state?.atlasEligibilitySource || null,
    atlasAutomationEnabled: row.workflow_state?.atlasAutomationEnabled ?? null,
    campaignIntakePurpose: row.workflow_state?.campaignIntakePurpose || null,
    iulWorkflowStage: row.workflow_state?.iulWorkflowStage || null,
    canonicalMilestone: row.workflow_state?.canonicalMilestone || null,
    ...extra
  };
}

async function main() {
  const apply = process.argv.includes("--apply");

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", TEAM_LEGACY)
    .maybeSingle();
  if (orgError) {
    throw orgError;
  }

  const { data: rows, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("organization_id", TEAM_LEGACY)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }

  const classified = (rows || []).map((row) => {
    const extra = classifyRow(row);
    return { row, ...extra, summary: summarize(row, extra) };
  });

  const groups = classified.reduce((acc, item) => {
    acc[item.classification] = acc[item.classification] || [];
    acc[item.classification].push(item);
    return acc;
  }, {});

  const canaries = classified.filter((item) =>
    CANARY_NAMES.includes(String(item.row.name || "").trim().toLowerCase())
  );

  const report = {
    organization: org,
    before: {
      total: classified.length,
      genuine_legacy_prospect: (groups.genuine_legacy_prospect || []).length,
      genuine_legacy_wrong_tv_prefix: (groups.genuine_legacy_wrong_tv_prefix || []).length,
      personal_unknown_incorrectly_promoted:
        (groups.personal_unknown_incorrectly_promoted || []).length,
      non_operational_other: (groups.non_operational_other || []).length,
      operational: classified.filter((item) => item.operational).length
    },
    misclassified: (groups.personal_unknown_incorrectly_promoted || []).map(
      (item) => item.summary
    ),
    wrongPrefix: (groups.genuine_legacy_wrong_tv_prefix || []).map((item) => item.summary),
    genuine: [
      ...(groups.genuine_legacy_prospect || []),
      ...(groups.genuine_legacy_wrong_tv_prefix || [])
    ].map((item) => item.summary),
    canaries: canaries.map((item) => item.summary),
    apply
  };

  console.log(JSON.stringify(report, null, 2));

  if (!apply) {
    console.error(
      "\nRead-only audit complete. Re-run with --apply to de-promote misclassified rows and remint genuine TV- Legacy IDs."
    );
    return;
  }

  const depromoted = [];
  for (const item of groups.personal_unknown_incorrectly_promoted || []) {
    const patch = buildDepromotionPatch({
      reason: item.reason || "NO_VALID_PROMOTION_SIGNAL"
    });
    const { data: merged, error: mergeError } = await supabase.rpc(
      "merge_prospect_workflow_state",
      {
        p_prospect_id: item.row.id,
        p_organization_id: TEAM_LEGACY,
        p_patch: patch
      }
    );
    if (mergeError || merged == null) {
      throw mergeError || new Error(`Depromotion merge missed ${item.row.id}`);
    }
    await savePersistedWorkflowState(item.row.phone, patch, {
      organizationId: TEAM_LEGACY,
      prospectId: item.row.id
    }).catch(() => null);
    depromoted.push(item.row.id);
  }

  const reminted = [];
  const expectedPrefix = deriveProspectNumberPrefix(org || { slug: "team-legacy" });
  for (const item of groups.genuine_legacy_wrong_tv_prefix || []) {
    const nextNumber = await generateNextProspectNumber(TEAM_LEGACY, {
      organization: org || { slug: "team-legacy", name: "Team Legacy" }
    });
    const { error: updateError } = await supabase
      .from("prospects")
      .update({ prospect_number: nextNumber })
      .eq("id", item.row.id)
      .eq("organization_id", TEAM_LEGACY);
    if (updateError) {
      throw updateError;
    }
    reminted.push({
      id: item.row.id,
      from: item.row.prospect_number,
      to: nextNumber,
      prefix: expectedPrefix
    });
  }

  const { data: afterRows, error: afterError } = await supabase
    .from("prospects")
    .select("*")
    .eq("organization_id", TEAM_LEGACY);
  if (afterError) {
    throw afterError;
  }
  const afterClassified = (afterRows || []).map((row) => ({
    row,
    ...classifyRow(row)
  }));

  console.log(
    JSON.stringify(
      {
        applied: true,
        depromotedIds: depromoted,
        reminted,
        after: {
          total: afterClassified.length,
          operational: afterClassified.filter((item) => item.operational).length,
          personal_unknown_incorrectly_promoted: afterClassified.filter(
            (item) => item.classification === "personal_unknown_incorrectly_promoted"
          ).length,
          depromoted_contact_preserved: afterClassified.filter(
            (item) => item.classification === "depromoted_contact_preserved"
          ).length,
          genuine_legacy_wrong_tv_prefix: afterClassified.filter(
            (item) => item.classification === "genuine_legacy_wrong_tv_prefix"
          ).length,
          genuine_legacy_prospect: afterClassified.filter(
            (item) => item.classification === "genuine_legacy_prospect"
          ).length
        }
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
