import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildAppointmentSettingsSavePayload,
  calendarStatusLabel,
  calendarStatusVariant,
  formatLocationAddress,
  hasTeamVisionFallbackCopy,
  resolveCalendarSources
} from "./appointmentSettingsPresentation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TV = "00000000-0000-4000-8000-000000000001";
const TL = "af8fb707-f26c-4152-ad77-2d079d30bc8a";
const THIRD = "11111111-2222-4333-8444-555555555555";

function translate(key) {
  return {
    appointmentsCalendarUnavailable: "Unavailable",
    configurationGoogleReconnectBadge: "Reconnect required",
    configurationConnected: "Connected",
    configurationNotConnected: "Not connected"
  }[key] || key;
}

test("1. page uses Atlas form styles and labeled fields", () => {
  const page = fs.readFileSync(path.join(__dirname, "AppointmentSettings.jsx"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "Configuration.css"), "utf8");
  assert.match(page, /configuration-form appointment-settings/);
  assert.match(page, /appointmentsSettingsPageTitle/);
  assert.match(page, /appointmentsDefaultDuration/);
  assert.match(page, /appointmentsRecruitingDuration/);
  assert.match(page, /appointmentsBufferBefore/);
  assert.match(page, /appointmentsBufferAfter/);
  assert.match(page, /configurationTimezone/);
  assert.match(css, /\.appointment-settings\.configuration-form/);
  assert.match(css, /\.configuration-form textarea/);
});

test("2. Team Vision values load from the requesting profile payload", () => {
  const payload = {
    profile: {
      organizationId: TV,
      appointmentProfile: {
        defaults: { timezone: "America/New_York", defaultDurationMinutes: 30 },
        virtualMeeting: { preferredProvider: "zoom" },
        office: { name: "Team Vision HQ" },
        favoritePublicLocations: [],
        workingSchedule: []
      }
    },
    calendarSources: {
      google: { connected: true, googleAccountEmail: "vision@example.com" },
      icloud: { available: true, connected: false }
    }
  };
  const sources = resolveCalendarSources(payload);
  const save = buildAppointmentSettingsSavePayload(payload.profile);
  assert.equal(payload.profile.organizationId, TV);
  assert.equal(save.defaults.timezone, "America/New_York");
  assert.equal(sources.google.connected, true);
  assert.equal(sources.icloud.connected, false);
});

test("3. Team Legacy values stay isolated from Team Vision", () => {
  const payload = {
    profile: {
      organizationId: TL,
      appointmentProfile: {
        defaults: { timezone: "America/New_York", defaultDurationMinutes: 45 },
        virtualMeeting: { preferredProvider: "zoom" },
        office: { name: "Team Legacy office" },
        favoritePublicLocations: [],
        workingSchedule: []
      }
    },
    calendarSources: {
      google: { connected: false },
      icloud: { available: false, connected: false }
    }
  };
  const save = buildAppointmentSettingsSavePayload(payload.profile);
  assert.equal(payload.profile.organizationId, TL);
  assert.notEqual(payload.profile.organizationId, TV);
  assert.equal(save.office.name, "Team Legacy office");
  assert.equal(resolveCalendarSources(payload).google.connected, false);
});

test("4. no Team Vision fallback in page copy or calendar presentation", () => {
  const page = fs.readFileSync(path.join(__dirname, "AppointmentSettings.jsx"), "utf8");
  const translations = fs.readFileSync(
    path.join(__dirname, "../../i18n/translations.js"),
    "utf8"
  );
  assert.equal(hasTeamVisionFallbackCopy(page), false);
  assert.doesNotMatch(page, /calendarConnection\?\.connected/);
  assert.doesNotMatch(translations, /Zoom is the Team Vision default provider/);
  assert.doesNotMatch(translations, /Google Calendar status for this organization/);
});

test("5. current calendar connection status uses personal Google and iCloud", () => {
  const connected = resolveCalendarSources({
    calendarConnection: { connected: false },
    calendarSources: {
      google: { connected: true, googleAccountEmail: "me@example.com" },
      icloud: { available: true, connected: true, appleAccountEmail: "me@icloud.com" }
    }
  });
  assert.equal(connected.google.connected, true);
  assert.equal(connected.icloud.connected, true);
  assert.equal(calendarStatusLabel(connected.google, translate), "Connected");
  assert.equal(calendarStatusVariant(connected.google), "success");

  const disconnectedLegacy = resolveCalendarSources({
    calendarConnection: { connected: false }
  });
  assert.equal(disconnectedLegacy.google.connected, false);
  assert.equal(calendarStatusLabel(disconnectedLegacy.google, translate), "Not connected");
});

test("6. save persists expected appointment settings", () => {
  const payload = buildAppointmentSettingsSavePayload({
    appointmentProfile: {
      workingSchedule: [{ dayOfWeek: 1, enabled: true, blocks: [{ start: "09:00", end: "17:00" }] }],
      defaults: {
        defaultDurationMinutes: 30,
        recruitingInterviewDurationMinutes: 45,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 15,
        timezone: "America/New_York"
      },
      virtualMeeting: { preferredProvider: "zoom", personalMeetingUrl: "https://secret.example" },
      office: { name: "Office", address: "1 Main" },
      favoritePublicLocations: [{ id: "loc-1", name: "Cafe", address: "2 Pine" }]
    }
  });
  assert.equal(payload.defaults.recruitingInterviewDurationMinutes, 45);
  assert.equal(payload.virtualMeeting.preferredProvider, "zoom");
  assert.equal(payload.virtualMeeting.personalMeetingUrl, undefined);
  assert.equal(payload.favoritePublicLocations[0].name, "Cafe");
});

test("7. responsive layout and field labels stay present", () => {
  const page = fs.readFileSync(path.join(__dirname, "AppointmentSettings.jsx"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "Configuration.css"), "utf8");
  assert.match(page, /configuration-grid-2/);
  assert.match(css, /@media \(min-width: 640px\)/);
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(page, /appointmentsOfficeName/);
  assert.match(page, /appointmentsOfficeAddress/);
  assert.match(page, /appointmentsOfficeCity/);
  assert.match(page, /appointmentsOfficeState/);
  assert.match(page, /appointmentsOfficePostal/);
  assert.match(page, /appointmentsOfficeParking/);
  assert.equal(formatLocationAddress({ address: "1 Main", city: "Miami", state: "FL" }), "1 Main, Miami, FL");
});

test("8. Super Admin Support Mode stays empty on the control plane", () => {
  const page = fs.readFileSync(path.join(__dirname, "AppointmentSettings.jsx"), "utf8");
  const routes = fs.readFileSync(
    path.join(__dirname, "../../../../backend/routes/appointments.js"),
    "utf8"
  );
  assert.match(page, /isGlobalSuperAdminControlPlane/);
  assert.match(page, /ControlPlaneEmptyState/);
  assert.match(routes, /emptyAppointmentProfile/);
  assert.match(routes, /operationalControlPlaneEmpty\(emptyAppointmentProfile\)/);
});

test("arbitrary third tenant payload does not inherit Vision calendar state", () => {
  const vision = resolveCalendarSources({
    organizationId: TV,
    calendarSources: { google: { connected: true }, icloud: { available: true, connected: true } }
  });
  const third = resolveCalendarSources({
    organizationId: THIRD,
    calendarSources: { google: { connected: false }, icloud: { available: false, connected: false } }
  });
  assert.equal(vision.google.connected, true);
  assert.equal(third.google.connected, false);
  assert.equal(third.icloud.available, false);
});
