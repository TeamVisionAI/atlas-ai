const test = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000099";
const AGENT_A = "11111111-1111-4111-8111-111111111111";
const AGENT_B = "22222222-2222-4222-8222-222222222222";

function futureIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function baseAppointment(overrides = {}) {
  return {
    id: overrides.id || "appt-urgent-1",
    organizationId: ORG_A,
    agentId: AGENT_A,
    interviewerUserId: AGENT_A,
    prospectPhone: "+15550001111",
    startDateTime: futureIso(11),
    timezone: "America/New_York",
    purpose: "recruiting_interview",
    meetingType: "virtual",
    meetingProvider: "zoom",
    virtualMeetingUrl: "https://zoom.us/j/123456789",
    metadata: { prospectName: "Naty Example" },
    ...overrides
  };
}

function installMocks(options = {}) {
  const auditCalls = [];
  const sendCalls = [];

  const repository = require("../repositories/appointmentUrgentHandoffRepository")
    .createMemoryAppointmentUrgentHandoffRepository();

  require("../repositories/appointmentUrgentHandoffRepository").injectAppointmentUrgentHandoffRepository(
    repository
  );

  const originalSend = require("../services/whatsappService").sendTextMessage;
  require("../services/whatsappService").sendTextMessage = async (to, message, meta = {}) => {
    sendCalls.push({ to, message, meta });
    return { success: true, simulated: true };
  };

  const originalAudit = require("../security/auditLogService").writeAuditLog;
  require("../security/auditLogService").writeAuditLog = async (entry) => {
    auditCalls.push(entry);
    return entry;
  };

  const originalFindProspect = require("../services/supabaseService").findProspectInOrganization;
  require("../services/supabaseService").findProspectInOrganization = async () => ({
    phone: "+15550001111",
    name: "Naty Example",
    organization_id: ORG_A
  });

  if (options.resolveAgentDestination) {
    const resolver = require("../core/agentNotificationDestinationResolver");
    resolver.resolveAgentUrgentWhatsAppDestination = options.resolveAgentDestination;
  }

  if (options.resolveEscalationDestination) {
    const resolver = require("../core/agentNotificationDestinationResolver");
    resolver.resolveUrgentEscalationWhatsAppDestination = options.resolveEscalationDestination;
  }

  delete require.cache[require.resolve("../core/appointmentUrgentHandoffEngine")];
  const engine = require("../core/appointmentUrgentHandoffEngine");

  return {
    repository,
    auditCalls,
    sendCalls,
    engine,
    restore() {
      require("../services/whatsappService").sendTextMessage = originalSend;
      require("../security/auditLogService").writeAuditLog = originalAudit;
      require("../services/supabaseService").findProspectInOrganization = originalFindProspect;
      delete require.cache[require.resolve("../core/appointmentUrgentHandoffEngine")];
      require("../repositories/appointmentUrgentHandoffRepository").resetAppointmentUrgentHandoffRepositoryInjection();
    }
  };
}

test("11 minutes away triggers urgent handoff + immediate prospect confirmation", async () => {
  const mocks = installMocks();

  try {
    assert.equal(mocks.engine.isUrgentAppointment(baseAppointment()), true);

    const result = await mocks.engine.processUrgentHandoffOnCreate(baseAppointment(), {
      organizationId: ORG_A
    });

    assert.equal(result.triggered, true);
    assert.equal(result.prospectConfirmation.status, "sent");
    assert.equal(mocks.sendCalls.length, 1);
    assert.equal(mocks.sendCalls[0].to, "+15550001111");
    assert.equal(mocks.sendCalls[0].meta.intent, "APPOINTMENT_CONFIRMATION");
    assert.match(mocks.sendCalls[0].message, /Zoom|zoom/i);
    assert.ok(
      mocks.auditCalls.some((entry) => entry.action === "urgent_appointment_handoff_created")
    );
  } finally {
    mocks.restore();
  }
});

test("45 minutes away triggers urgent handoff", async () => {
  const mocks = installMocks();

  try {
    assert.equal(
      mocks.engine.isUrgentAppointment(baseAppointment({ startDateTime: futureIso(45) })),
      true
    );

    const result = await mocks.engine.processUrgentHandoffOnCreate(
      baseAppointment({ startDateTime: futureIso(45) }),
      { organizationId: ORG_A }
    );

    assert.equal(result.triggered, true);
    assert.equal(result.handoff.minutesUntilStart, 45);
  } finally {
    mocks.restore();
  }
});

test("90 minutes away does not trigger urgent handoff", async () => {
  const mocks = installMocks();

  try {
    assert.equal(
      mocks.engine.isUrgentAppointment(baseAppointment({ startDateTime: futureIso(90) })),
      false
    );

    const result = await mocks.engine.processUrgentHandoffOnCreate(
      baseAppointment({ startDateTime: futureIso(90) }),
      { organizationId: ORG_A }
    );

    assert.equal(result.triggered, false);
    assert.equal(mocks.sendCalls.length, 0);
  } finally {
    mocks.restore();
  }
});

test("in-person appointment confirmation includes office context", async () => {
  const mocks = installMocks();

  try {
    const result = await mocks.engine.processUrgentHandoffOnCreate(
      baseAppointment({
        meetingType: "in_person",
        meetingLocationType: "office",
        meetingAddress: "123 Main St, Miami, FL",
        virtualMeetingUrl: null,
        meetingProvider: null
      }),
      { organizationId: ORG_A }
    );

    assert.equal(result.triggered, true);
    assert.match(mocks.sendCalls[0].message, /123 Main St|Miami/i);
    assert.equal(mocks.engine.resolveMeetingTypeLabel({ meetingType: "in_person" }), "In Person");
  } finally {
    mocks.restore();
  }
});

test("cross-tenant isolation on acknowledge", async () => {
  const mocks = installMocks();

  try {
    const created = await mocks.engine.processUrgentHandoffOnCreate(
      baseAppointment({ organizationId: ORG_A }),
      { organizationId: ORG_A }
    );

    await assert.rejects(
      () =>
        mocks.engine.acknowledgeUrgentHandoff(created.handoff.id, {
          organizationId: ORG_B,
          userId: AGENT_A
        }),
      /not found/i
    );
  } finally {
    mocks.restore();
  }
});

test("acknowledgment prevents escalation", async () => {
  const mocks = installMocks({
    resolveEscalationDestination: async () => ({
      userId: AGENT_B,
      whatsappE164: "+15550009999"
    })
  });

  try {
    const created = await mocks.engine.processUrgentHandoffOnCreate(
      baseAppointment({
        startDateTime: futureIso(4),
        id: "appt-escalation-blocked"
      }),
      { organizationId: ORG_A, reference: new Date() }
    );

    await mocks.engine.acknowledgeUrgentHandoff(created.handoff.id, {
      organizationId: ORG_A,
      userId: AGENT_A
    });

    const escalationResults = await mocks.engine.processDueUrgentEscalations({
      reference: new Date(Date.now() + 10 * 60_000)
    });

    assert.equal(escalationResults.length, 0);
    assert.equal(mocks.sendCalls.filter((call) => call.meta.intent?.includes("ESCALATION")).length, 0);
  } finally {
    mocks.restore();
  }
});

test("duplicate scheduling retries do not duplicate notifications", async () => {
  const mocks = installMocks();

  try {
    const appointment = baseAppointment({ id: "appt-idempotent" });
    const first = await mocks.engine.processUrgentHandoffOnCreate(appointment, { organizationId: ORG_A });
    const second = await mocks.engine.processUrgentHandoffOnCreate(appointment, { organizationId: ORG_A });

    assert.equal(first.triggered, true);
    assert.equal(second.idempotent, true);
    assert.equal(mocks.sendCalls.length, 1);
    assert.equal(
      mocks.auditCalls.filter((entry) => entry.action === "urgent_appointment_handoff_created").length,
      1
    );
  } finally {
    mocks.restore();
  }
});

test("agent WhatsApp fails closed without explicit destination configuration", async () => {
  const mocks = installMocks();

  try {
    const result = await mocks.engine.processUrgentHandoffOnCreate(baseAppointment(), {
      organizationId: ORG_A
    });

    assert.equal(result.agentWhatsapp.status, "skipped");
    assert.equal(result.agentWhatsapp.reason, "NO_EXPLICIT_AGENT_WHATSAPP_DESTINATION");
    assert.ok(
      mocks.auditCalls.some(
        (entry) => entry.action === "urgent_appointment_handoff_agent_whatsapp_skipped"
      )
    );
    assert.equal(
      mocks.sendCalls.filter((call) => call.meta.intent === "URGENT_APPOINTMENT_HANDOFF").length,
      0
    );
  } finally {
    mocks.restore();
  }
});

test("agent WhatsApp sends only when explicit destination is configured", async () => {
  const mocks = installMocks({
    resolveAgentDestination: async () => ({
      userId: AGENT_A,
      whatsappE164: "+15550008888"
    })
  });

  try {
    const result = await mocks.engine.processUrgentHandoffOnCreate(baseAppointment(), {
      organizationId: ORG_A
    });

    assert.equal(result.agentWhatsapp.status, "sent");
    const agentSend = mocks.sendCalls.find(
      (call) => call.meta.intent === "URGENT_APPOINTMENT_HANDOFF"
    );
    assert.ok(agentSend);
    assert.equal(agentSend.to, "+15550008888");
    assert.match(agentSend.message, /Naty/);
    assert.match(agentSend.message, /Zoom/);
  } finally {
    mocks.restore();
  }
});

test("buildAgentWhatsAppAlertMessage uses Spanish copy shape", () => {
  const mocks = installMocks();

  try {
    const message = mocks.engine.buildAgentWhatsAppAlertMessage(
    {
      prospectName: "Naty Example",
      purpose: "recruiting_interview",
      meetingType: "virtual",
      virtualMeetingUrl: "https://zoom.us/j/123",
      appointmentStart: futureIso(11),
      minutesUntilStart: 11,
      prospectPhone: "+15550001111"
    },
    "es"
    );

    assert.match(message, /🚨 Nueva entrevista/);
    assert.match(message, /Naty · Reclutamiento · Zoom/);
    assert.match(message, /Comienza en 11 minutos/);
  } finally {
    mocks.restore();
  }
});
