import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAppointmentCommunicationPurpose,
  isAppointmentCommunicationAction,
  APPOINTMENT_COMMUNICATION_PURPOSES
} from "./appointmentCommunicationEngine.js";
import { COMMUNICATION_ACTION_IDS } from "./communicationActionStateEngine.js";

test("resolveAppointmentCommunicationPurpose maps panel actions", () => {
  assert.equal(
    resolveAppointmentCommunicationPurpose(COMMUNICATION_ACTION_IDS.RESEND_INTERVIEW_DETAILS),
    APPOINTMENT_COMMUNICATION_PURPOSES.INVITATION
  );
  assert.equal(
    resolveAppointmentCommunicationPurpose(COMMUNICATION_ACTION_IDS.SEND_REMINDER),
    APPOINTMENT_COMMUNICATION_PURPOSES.REMINDER
  );
  assert.equal(
    resolveAppointmentCommunicationPurpose(COMMUNICATION_ACTION_IDS.SEND_ZOOM),
    APPOINTMENT_COMMUNICATION_PURPOSES.ZOOM
  );
  assert.equal(
    resolveAppointmentCommunicationPurpose(COMMUNICATION_ACTION_IDS.SEND_OFFICE),
    APPOINTMENT_COMMUNICATION_PURPOSES.OFFICE
  );
  assert.equal(resolveAppointmentCommunicationPurpose("whatsapp"), null);
});

test("isAppointmentCommunicationAction identifies appointment panel actions only", () => {
  assert.equal(isAppointmentCommunicationAction(COMMUNICATION_ACTION_IDS.SEND_ZOOM), true);
  assert.equal(isAppointmentCommunicationAction(COMMUNICATION_ACTION_IDS.CUSTOM), false);
});
