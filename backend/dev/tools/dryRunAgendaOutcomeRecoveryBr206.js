/**
 * BR-206 — READ-ONLY dry-run for the two live recovery cases.
 * Does not insert, update, or delete.
 *
 *   node backend/dev/tools/dryRunAgendaOutcomeRecoveryBr206.js
 */

"use strict";

require("dotenv").config({ path: require("node:path").join(__dirname, "../../../.env") });

const { supabase } = require("../../services/supabaseService");
const { rowToAppointment } = require("../../core/appointmentReadModel");
const { planAgendaOutcomeRecovery, RECOVERY_ACTIONS } = require("../../core/agendaOutcomeEvidence");

const ORG = "00000000-0000-4000-8000-000000000001";
const LEIDY = {
  appointmentId: "9f9c7c5b-35f4-4ea9-8117-05630d46897e",
  contactId: "06a1cda4-156e-4f83-824e-33302e9fdf04",
  prospectId: "2fbb5bd6-61db-4807-9d6f-74dad6b30e7b"
};
const ALEJANDRO = {
  appointmentId: "54603962-2156-472a-b8d9-2d997e1612c7",
  contactId: "3a4467cf-127b-42c4-b046-9f280fccf61b"
};

async function loadAppointment(id) {
  const { data, error } = await supabase
    .from("atlas_appointments")
    .select("*")
    .eq("organization_id", ORG)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return rowToAppointment(data);
}

async function loadContact(id) {
  const { data, error } = await supabase
    .from("atlas_agenda_contacts")
    .select("*")
    .eq("organization_id", ORG)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    organizationId: data.organization_id,
    ownerUserId: data.owner_user_id,
    name: data.name,
    phone: data.phone,
    promotedProspectId: data.promoted_prospect_id,
    promotedClientId: data.promoted_client_id
  };
}

async function loadProspect(id) {
  const { data, error } = await supabase
    .from("prospects")
    .select("id, name, phone, status, current_step, entry_method, prospect_number")
    .eq("organization_id", ORG)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadClientForContact(contactId) {
  const { data, error } = await supabase
    .from("atlas_agenda_clients")
    .select("id, name, phone")
    .eq("organization_id", ORG)
    .eq("agenda_contact_id", contactId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function main() {
  const leidyAppointment = await loadAppointment(LEIDY.appointmentId);
  const leidyContact = await loadContact(LEIDY.contactId);
  const leidyProspect = await loadProspect(LEIDY.prospectId);
  const leidyClient = await loadClientForContact(LEIDY.contactId);

  const alejandroAppointment = await loadAppointment(ALEJANDRO.appointmentId);
  const alejandroContact = await loadContact(ALEJANDRO.contactId);
  const alejandroClient = await loadClientForContact(ALEJANDRO.contactId);

  const leidyPlan = planAgendaOutcomeRecovery({
    action: RECOVERY_ACTIONS.RECORD_CLIENT,
    appointment: leidyAppointment,
    contact: leidyContact,
    existingProspect: leidyProspect,
    existingClient: leidyClient
  });

  const alejandroPlan = planAgendaOutcomeRecovery({
    action: RECOVERY_ACTIONS.RECORD_RECRUIT_AND_CLIENT,
    appointment: alejandroAppointment,
    contact: alejandroContact,
    existingClient: alejandroClient,
    recruiter: {
      agendaContactId: LEIDY.contactId,
      displayName: "Leidy Scull"
    },
    displayName: "Alejandro"
  });

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        mutated: false,
        leidy: leidyPlan,
        alejandro: alejandroPlan
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
