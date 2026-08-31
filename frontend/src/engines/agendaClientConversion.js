/**
 * BR-194 — Agenda CLIENT conversion presentation helpers.
 */

export const CLIENT_CONVERSION_STATUSES = Object.freeze({
  INCOMPLETE: "incomplete",
  COMPLETE: "complete"
});

export function isStandaloneAgendaAppointment(appointment) {
  return appointment?.metadata?.standaloneAgenda === true;
}

export function isAgendaClientConversionComplete(appointment) {
  return (
    appointment?.metadata?.promotedToClient === true ||
    appointment?.metadata?.clientConversionStatus === CLIENT_CONVERSION_STATUSES.COMPLETE
  );
}

export function isAgendaClientConversionIncomplete(appointment) {
  if (!isStandaloneAgendaAppointment(appointment)) return false;
  if (isAgendaClientConversionComplete(appointment)) return false;
  return (
    appointment?.outcome === "client" ||
    appointment?.metadata?.clientConversionIncomplete === true ||
    appointment?.metadata?.clientConversionStatus === CLIENT_CONVERSION_STATUSES.INCOMPLETE
  );
}
