import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Organization settings uses control-plane empty state for Super Admin", () => {
  const page = fs.readFileSync(
    path.join(__dirname, "OrganizationConfiguration.jsx"),
    "utf8"
  );
  const meeting = fs.readFileSync(
    path.join(__dirname, "../../components/settings/MeetingManagement.jsx"),
    "utf8"
  );
  const routes = fs.readFileSync(
    path.join(__dirname, "../../../../backend/routes/configuration.js"),
    "utf8"
  );

  assert.match(page, /isGlobalSuperAdminControlPlane/);
  assert.match(page, /ControlPlaneEmptyState/);
  assert.match(meeting, /isGlobalSuperAdminControlPlane/);
  assert.match(meeting, /ControlPlaneEmptyState/);
  assert.match(routes, /emptyOrganizationConfiguration/);
  assert.match(routes, /resolvePersonalIntegrationOrganizationId/);
});
