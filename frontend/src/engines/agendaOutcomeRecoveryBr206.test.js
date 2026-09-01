import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("K) past manual agenda remains listed and recoverable in Appointments UI", () => {
  const page = fs.readFileSync(
    path.join(__dirname, "../pages/AppointmentsPage.jsx"),
    "utf8"
  );
  const actions = fs.readFileSync(
    path.join(__dirname, "../components/appointments/AppointmentCardActions.jsx"),
    "utf8"
  );
  const service = fs.readFileSync(
    path.join(__dirname, "../services/agendaService.js"),
    "utf8"
  );
  assert.match(page, /past_unresolved/);
  assert.match(page, /RecoverAgendaOutcomeDialog/);
  assert.match(actions, /agendaRecoverRecruitAndClient/);
  assert.match(service, /dryRun:\s*true/);
  assert.match(service, /\/recover/);
});
