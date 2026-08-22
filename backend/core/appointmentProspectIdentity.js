/**
 * APR1 — Appointment prospect identity helpers.
 * atlas_appointments.prospect_id = public.prospects.id
 * metadata.coreProspectId = atlas_core_prospects.id (optional explicit bridge)
 */

function appointmentPublicProspectId(appointment = {}) {
  return appointment.prospectId || appointment.prospect_id || null;
}

function appointmentCoreProspectId(appointment = {}) {
  const metadata = appointment.metadata || {};
  return (
    metadata.coreProspectId ||
    metadata.core_prospect_id ||
    appointment.coreProspectId ||
    null
  );
}

/**
 * True when scoped prospectId matches the appointment's public FK or stored core id.
 * Recruit AI reclaim/ownership may pass either identity.
 */
function appointmentMatchesProspectIdentity(appointment, prospectId) {
  if (!prospectId) {
    return false;
  }

  const wanted = String(prospectId);
  const publicId = appointmentPublicProspectId(appointment);
  if (publicId && String(publicId) === wanted) {
    return true;
  }

  const coreId = appointmentCoreProspectId(appointment);
  if (coreId && String(coreId) === wanted) {
    return true;
  }

  return false;
}

module.exports = {
  appointmentPublicProspectId,
  appointmentCoreProspectId,
  appointmentMatchesProspectIdentity
};
