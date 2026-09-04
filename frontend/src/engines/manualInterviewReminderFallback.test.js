import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANUAL_REMINDER_CONTACT_NAME,
  buildManualInterviewReminderFallback,
  buildManualOfficeAddressFallback,
  formatReminderWhenParts,
  resolveInterviewReminderPreviewOrFallback,
  resolveManualCommunicationPreviewOrFallback
} from "./manualInterviewReminderFallback.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OFFICE_ADDRESS = "2500 NW 79th Ave, Suite 189, Doral, FL 33122";
const START_ISO = "2026-03-15T18:30:00.000Z";
const TIMEZONE = "America/New_York";

const officeWorkspace = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  phone: "+15555550100",
  prospect: { name: "Maria Lopez" },
  capture: { preferredLanguage: "es" },
  interview: {
    datetime: START_ISO,
    type: "office",
    timezone: TIMEZONE,
    meetingAddress: OFFICE_ADDRESS
  }
};

const zoomWorkspace = {
  ...officeWorkspace,
  interview: {
    datetime: START_ISO,
    type: "zoom",
    timezone: TIMEZONE,
    meetingAddress: OFFICE_ADDRESS
  }
};

test("BR-214 contact name is Ana Perez", () => {
  assert.equal(MANUAL_REMINDER_CONTACT_NAME, "Ana Perez");
});

test("preview success keeps assembled reminder and does not swap in fallback", () => {
  const previewMessage = "Assembled interview reminder preview.";
  const resolved = resolveInterviewReminderPreviewOrFallback({
    preview: {
      success: true,
      message: previewMessage,
      phone: "+15555550199",
      outboundPayload: { message: previewMessage, phone: "+15555550199" }
    },
    workspace: officeWorkspace,
    phone: "+15555550100"
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.fallbackUsed, false);
  assert.equal(resolved.message, previewMessage);
  assert.equal(resolved.phone, "+15555550199");
});

test("server fallbackUsed still opens a sendable reminder body", () => {
  const fallbackMessage = "Hola, Maria. Le recordamos su cita programada para domingo 15 de marzo a las 2:30 p. m. por Zoom. Si necesita ayuda o tiene alguna pregunta, puede comunicarse con Ana Perez. Por favor confirme que recibió este recordatorio.";
  const resolved = resolveInterviewReminderPreviewOrFallback({
    preview: {
      success: true,
      fallbackUsed: true,
      message: fallbackMessage,
      outboundPayload: { message: fallbackMessage, fallbackUsed: true }
    },
    workspace: zoomWorkspace,
    phone: "+15555550100"
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.fallbackUsed, true);
  assert.equal(resolved.message, fallbackMessage);
});

test("preview failure still yields a sendable fallback reminder", () => {
  const resolved = resolveInterviewReminderPreviewOrFallback({
    preview: { success: false, message: "Could not load the communication preview." },
    workspace: officeWorkspace,
    phone: "+15555550100"
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.fallbackUsed, true);
  assert.match(resolved.message, /Hola, Maria\./);
  assert.ok(resolved.message.includes("Ana Perez"));
  assert.ok(resolved.message.includes(OFFICE_ADDRESS));
  assert.equal(resolved.phone, "+15555550100");
});

test("in-person reminder fallback includes office address and Ana Perez", () => {
  const when = formatReminderWhenParts(START_ISO, TIMEZONE, "es");
  const message = buildManualInterviewReminderFallback({
    prospectName: "Maria Lopez",
    startIso: START_ISO,
    timezone: TIMEZONE,
    meetingMode: "office",
    officeAddress: OFFICE_ADDRESS,
    language: "es",
    organizationId: "00000000-0000-4000-8000-000000000001"
  });

  assert.match(message, /Hola, Maria\./);
  assert.ok(message.includes(when.weekday));
  assert.ok(message.includes(when.time));
  assert.ok(message.includes(OFFICE_ADDRESS));
  assert.ok(message.includes("Ana Perez"));
  assert.ok(!message.toLowerCase().includes("zoom"));
});

test("Zoom reminder fallback includes Zoom wording and excludes office address", () => {
  const resolved = resolveInterviewReminderPreviewOrFallback({
    preview: { success: false },
    workspace: zoomWorkspace,
    phone: "+15555550100"
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.fallbackUsed, true);
  assert.match(resolved.message, /Hola, Maria\./);
  assert.ok(resolved.message.includes("por Zoom"));
  assert.ok(resolved.message.includes("Ana Perez"));
  assert.ok(!resolved.message.includes(OFFICE_ADDRESS));
  assert.ok(!resolved.message.includes("oficina"));
});

test("preview failure for interview details still yields a sendable fallback", () => {
  const resolved = resolveManualCommunicationPreviewOrFallback({
    purpose: "invitation",
    preview: { success: false, message: "Could not load the communication preview." },
    workspace: officeWorkspace,
    phone: "+15555550100"
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.fallbackUsed, true);
  assert.match(resolved.message, /Le confirmamos su cita/);
  assert.ok(resolved.message.includes(OFFICE_ADDRESS));
  assert.ok(resolved.message.includes("Ana Perez"));
});

test("preview failure for office address still yields a sendable fallback", () => {
  const message = buildManualOfficeAddressFallback({
    prospectName: "Maria Lopez",
    officeAddress: OFFICE_ADDRESS,
    language: "es"
  });
  const resolved = resolveManualCommunicationPreviewOrFallback({
    purpose: "office",
    preview: { success: false },
    workspace: officeWorkspace,
    phone: "+15555550100"
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.fallbackUsed, true);
  assert.ok(resolved.message.includes(OFFICE_ADDRESS));
  assert.ok(resolved.message.includes("Ana Perez"));
  assert.ok(!resolved.message.toLowerCase().includes("zoom"));
  assert.ok(message.includes("Nuestra oficina está ubicada en"));
});

test("preview failure for Zoom invitation still yields a sendable fallback without office address", () => {
  const resolved = resolveManualCommunicationPreviewOrFallback({
    purpose: "zoom",
    preview: { success: false },
    workspace: zoomWorkspace,
    phone: "+15555550100"
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.fallbackUsed, true);
  assert.ok(resolved.message.includes("por Zoom"));
  assert.ok(resolved.message.includes("Ana Perez"));
  assert.ok(!resolved.message.includes(OFFICE_ADDRESS));
});

test("MC and Workspace communication actions open composer when preview fails", () => {
  const hook = fs.readFileSync(
    path.join(__dirname, "../hooks/useNativeInterviewWhatsApp.js"),
    "utf8"
  );
  assert.match(hook, /resolveManualCommunicationPreviewOrFallback/);
  assert.match(hook, /fallbackUsed: true/);
  assert.match(hook, /mode: "freeform_composer"/);
  assert.match(hook, /buildInterviewComposerPrefill/);
  assert.doesNotMatch(hook, /purpose === APPOINTMENT_COMMUNICATION_PURPOSES\.REMINDER/);

  const previewHook = fs.readFileSync(
    path.join(__dirname, "../hooks/useCommunicationPreview.js"),
    "utf8"
  );
  assert.match(previewHook, /resolveManualCommunicationPreviewOrFallback/);
  assert.match(previewHook, /applyFallbackComposer/);
  assert.match(previewHook, /composerSession/);

  const dashboard = fs.readFileSync(path.join(__dirname, "../pages/Dashboard.jsx"), "utf8");
  assert.match(dashboard, /openInterviewWhatsAppAction/);
  assert.match(dashboard, /communicationPreview.composerSession/);

  const workspaceActions = fs.readFileSync(
    path.join(__dirname, "../features/prospect-workspace/hooks/useWorkspaceActions.js"),
    "utf8"
  );
  assert.match(workspaceActions, /openInterviewWhatsAppAction/);
});
