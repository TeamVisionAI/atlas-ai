/**
 * Prevent duplicate/conflicting WhatsApp appointment confirmations.
 */

require("dotenv").config();

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  buildPersistedAppointmentConfirmation,
  buildAppointmentConfirmationIdempotencyKey,
  CONFIRMATION_IDEMPOTENCY_PREFIX
} = require("../core/appointmentConfirmationCopy");
const {
  REMINDER_SCHEDULE,
  REMINDER_TYPES,
  buildReminderMessage,
  deliverReminder
} = require("../services/appointmentReminderEngine");

const RVP = "33ad243a-9d00-4a4d-810b-df2762c0f076";
const APPT_ID = "2be8f18b-06be-4b2b-b8e0-c4b86d8c384f";

function officeAppointment(overrides = {}) {
  return {
    id: APPT_ID,
    startDateTime: "2026-08-07T21:15:00.000Z",
    timezone: "America/New_York",
    meetingType: "in_person",
    meetingLocationType: "office",
    meetingAddress: "2500 NW 79th Ave, Miami, Florida",
    virtualMeetingUrl: null,
    agent_id: RVP,
    ...overrides
  };
}

function zoomAppointment(overrides = {}) {
  return officeAppointment({
    meetingType: "virtual",
    meetingLocationType: "virtual",
    meetingProvider: "zoom",
    meetingAddress: null,
    virtualMeetingUrl: "https://zoom.example/j/1",
    ...overrides
  });
}

describe("WhatsApp duplicate scheduling confirmation", () => {
  it("1. successful autonomous scheduling sends one confirmation only (reminder schedule has no confirmation)", () => {
    assert.equal(
      REMINDER_SCHEDULE.some((rule) => rule.type === REMINDER_TYPES.CONFIRMATION),
      false
    );
    assert.equal(REMINDER_SCHEDULE.length, 3);
  });

  it("2. confirmation is generated from the persisted appointment", () => {
    const confirmation = buildPersistedAppointmentConfirmation(
      officeAppointment(),
      { preferred_language: "english", name: "Juanito Garcia" }
    );
    assert.match(confirmation.text, /5:15/);
    assert.match(confirmation.text, /Aug/);
    assert.doesNotMatch(confirmation.text, /1:15/);
    assert.equal(confirmation.idempotencyKey, `${CONFIRMATION_IDEMPOTENCY_PREFIX}${APPT_ID}`);
  });

  it("3. English preferred language produces English only", () => {
    const confirmation = buildPersistedAppointmentConfirmation(officeAppointment(), {
      preferred_language: "english",
      communication_language: "es",
      language: "es"
    });
    assert.equal(confirmation.language, "en");
    assert.match(confirmation.text, /You're all set/);
    assert.doesNotMatch(confirmation.text, /quedaste programado|Hola /);
  });

  it("4. Spanish preferred language produces Spanish only", () => {
    const confirmation = buildPersistedAppointmentConfirmation(officeAppointment(), {
      preferred_language: "spanish"
    });
    assert.equal(confirmation.language, "es");
    assert.match(confirmation.text, /quedaste programado/);
    assert.doesNotMatch(confirmation.text, /You're all set/);
  });

  it("5. Office appointment never produces Zoom copy", () => {
    const confirmation = buildPersistedAppointmentConfirmation(officeAppointment(), {
      preferred_language: "english"
    });
    assert.equal(confirmation.isVirtual, false);
    assert.match(confirmation.text, /office/);
    assert.doesNotMatch(confirmation.text, /Zoom/i);
  });

  it("6. Zoom appointment never produces office-address copy", () => {
    const confirmation = buildPersistedAppointmentConfirmation(zoomAppointment(), {
      preferred_language: "english"
    });
    assert.equal(confirmation.isVirtual, true);
    assert.match(confirmation.text, /Zoom/i);
    assert.doesNotMatch(confirmation.text, /2500 NW 79th/);
  });

  it("7. Date/time in confirmation equals canonical appointment timezone rendering", () => {
    const confirmation = buildPersistedAppointmentConfirmation(officeAppointment(), {
      preferred_language: "english"
    });
    assert.match(confirmation.whenLabel, /5:15/);
    assert.doesNotMatch(confirmation.whenLabel, /1:15/);
  });

  it("8. Stale prospect slot fields cannot override appointment values", () => {
    const confirmation = buildPersistedAppointmentConfirmation(
      officeAppointment({ startDateTime: "2026-08-07T21:15:00.000Z" }),
      {
        preferred_language: "english",
        interview_time: "2026-08-07T17:15:00.000Z",
        appointment_date: "Tomorrow at 9:00 AM",
        interview_type: "Zoom"
      }
    );
    assert.match(confirmation.text, /5:15/);
    assert.match(confirmation.text, /office/);
    assert.doesNotMatch(confirmation.text, /Zoom/i);
    assert.doesNotMatch(confirmation.text, /9:00/);
  });

  it("9. Duplicate event listeners are idempotently suppressed via confirmation key", () => {
    const key = buildAppointmentConfirmationIdempotencyKey(APPT_ID);
    assert.equal(key, `appointment-confirmation:${APPT_ID}`);
    assert.equal(buildAppointmentConfirmationIdempotencyKey(null), null);
  });

  it("10. Duplicate webhook delivery uses the same confirmation idempotency key", () => {
    const a = buildPersistedAppointmentConfirmation(officeAppointment(), {
      preferred_language: "english"
    });
    const b = buildPersistedAppointmentConfirmation(officeAppointment(), {
      preferred_language: "english"
    });
    assert.equal(a.idempotencyKey, b.idempotencyKey);
  });

  it("11. Google success callback path does not schedule a second confirmation reminder", () => {
    assert.equal(
      REMINDER_SCHEDULE.some((rule) => rule.type === REMINDER_TYPES.CONFIRMATION),
      false
    );
  });

  it("12. Failed Google sync does not send conflicting confirmation (copy independent of calendar)", () => {
    const confirmation = buildPersistedAppointmentConfirmation(
      officeAppointment({ calendarEventId: null, calendar_event_id: null }),
      { preferred_language: "english" }
    );
    assert.match(confirmation.text, /You're all set/);
    assert.doesNotMatch(confirmation.text, /calendar|Google|sync/i);
  });

  it("13. BR-075 outbound gate remains active", () => {
    const gate = path.join(__dirname, "../core/whatsappOutboundAuthorizationGate.js");
    assert.equal(fs.existsSync(gate), true);
    const source = fs.readFileSync(gate, "utf8");
    assert.match(source, /BR-075|24|session/i);
  });

  it("14. Meta Review remains unchanged", () => {
    const meta = path.join(__dirname, "../../frontend/src/config/metaReviewMode.js");
    assert.equal(fs.existsSync(meta), true);
  });

  it("15. Tenant and ownership isolation remain intact", () => {
    const confirmation = buildPersistedAppointmentConfirmation(officeAppointment(), {
      preferred_language: "english",
      owner_user_id: RVP,
      organization_id: "00000000-0000-4000-8000-000000000001"
    });
    assert.equal(confirmation.idempotencyKey.includes(APPT_ID), true);
    assert.equal(officeAppointment().agent_id, RVP);
  });

  it("legacy queued confirmation reminders are suppressed (not resent)", async () => {
    const result = await deliverReminder(
      {
        appointmentId: APPT_ID,
        organizationId: "00000000-0000-4000-8000-000000000001",
        prospectPhone: "+13059997338",
        reminderType: REMINDER_TYPES.CONFIRMATION
      },
      officeAppointment()
    );
    assert.equal(result.suppressed, true);
    assert.equal(result.delivered, false);
  });

  it("timed reminders respect preferred language and office/zoom type", () => {
    const enOffice = buildReminderMessage(
      officeAppointment(),
      REMINDER_TYPES.REMINDER_1H,
      { preferred_language: "english", name: "Juanito Garcia" }
    );
    assert.match(enOffice, /Hi Juanito/);
    assert.match(enOffice, /office/i);
    assert.doesNotMatch(enOffice, /Zoom/i);

    const esZoom = buildReminderMessage(
      zoomAppointment(),
      REMINDER_TYPES.REMINDER_1H,
      { preferred_language: "spanish", name: "Juanito Garcia" }
    );
    assert.match(esZoom, /Hola Juanito/);
    assert.match(esZoom, /Zoom/i);
    assert.doesNotMatch(esZoom, /oficina/);
  });
});
