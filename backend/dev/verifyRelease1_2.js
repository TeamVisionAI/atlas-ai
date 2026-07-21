/**
 * Release 1.2 — Organization Console verification.
 * Run: node backend/dev/verifyRelease1_2.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { EventBus } = require("../communication/events/EventBus");
const {
  createOrganizationManager,
  resetOrganizationRegistry,
  organizationStore,
  OrganizationEvent,
  listRoles,
  getAnalytics
} = require("../organizations");
const {
  registerTeamVisionRecruitingPackage,
  resetTeamVisionRecruitingPackage,
  createDefaultConfiguration
} = require("../packages/teamvision");

const CONSOLE_STORE_FILE = path.join(__dirname, "../data/organizationConsole.json");

async function run() {
  console.log("Release 1.2 — Organization Console verification\n");

  resetOrganizationRegistry();
  resetTeamVisionRecruitingPackage();
  organizationStore.clearStore();

  const eventBus = new EventBus();
  const events = {
    created: [],
    updated: [],
    packageInstalled: [],
    officeCreated: [],
    userCreated: [],
    configurationChanged: [],
    validationFailed: []
  };

  eventBus.on(OrganizationEvent.CREATED, (payload) => events.created.push(payload));
  eventBus.on(OrganizationEvent.UPDATED, (payload) => events.updated.push(payload));
  eventBus.on(OrganizationEvent.PACKAGE_INSTALLED, (payload) =>
    events.packageInstalled.push(payload)
  );
  eventBus.on(OrganizationEvent.OFFICE_CREATED, (payload) => events.officeCreated.push(payload));
  eventBus.on(OrganizationEvent.USER_CREATED, (payload) => events.userCreated.push(payload));
  eventBus.on(OrganizationEvent.CONFIGURATION_CHANGED, (payload) =>
    events.configurationChanged.push(payload)
  );
  eventBus.on(OrganizationEvent.VALIDATION_FAILED, (payload) =>
    events.validationFailed.push(payload)
  );

  const manager = createOrganizationManager({ eventBus });

  const org = await manager.createOrganization({
    profile: {
      name: "Acme Recruiting Group",
      legalName: "Acme Recruiting Group LLC",
      primaryLanguage: "en",
      supportedLanguages: ["en", "es"],
      timeZone: "America/New_York",
      dateFormat: "MM/DD/YYYY",
      email: "admin@acme.example",
      businessType: "recruiting"
    }
  });

  assert.ok(org.id, "Expected organization created");
  console.log("✓ Organization creation");

  await manager.configureBranding(org.id, {
    primaryColor: "#1a365d",
    secondaryColor: "#2b6cb0",
    accentColor: "#ed8936",
    emailSignature: "Acme Recruiting Team"
  });

  const branded = await manager.getOrganization(org.id);
  assert.strictEqual(branded.branding.primaryColor, "#1a365d");
  console.log("✓ Branding configuration");

  await manager.addOffice(org.id, {
    name: "Primary Office",
    address: "2500 NW 79th Ave, Suite 189, Doral, FL 33122",
    timeZone: "America/New_York",
    workingHours: { start: "09:00", end: "20:30" },
    meetingCapacity: 4,
    interviewAvailability: true,
    calendarMapping: "primary-calendar",
    zoomMapping: "primary-zoom"
  });

  await manager.addOffice(org.id, {
    name: "Satellite Office",
    address: "100 Main St, Orlando, FL 32801",
    timeZone: "America/New_York",
    status: "active"
  });

  const withOffices = await manager.getOrganization(org.id);
  assert.strictEqual(withOffices.locations.length, 2);
  console.log("✓ Multiple offices");

  assert.ok(listRoles().length >= 6, "Expected default roles");
  await manager.addUser(org.id, {
    name: "Alex Owner",
    email: "owner@acme.example",
    role: "owner",
    officeId: withOffices.locations[0].id,
    language: "en"
  });
  await manager.addUser(org.id, {
    name: "Riley Recruiter",
    email: "recruiter@acme.example",
    role: "recruiter",
    officeId: withOffices.locations[0].id,
    language: "en"
  });
  console.log("✓ User management");
  console.log("✓ Role management");

  await manager.configurePolicies(org.id, {
    interviewDurationMinutes: 45,
    maximumFollowUps: 5,
    allowedChannels: ["messenger", "whatsapp", "instagram"]
  });
  console.log("✓ Policy configuration");

  await manager.configureSettings(org.id, {
    workflowDefaults: { defaultWorkflowName: "team-vision-recruiting" },
    localization: { numberFormat: "en-US", dateFormat: "MM/DD/YYYY" }
  });

  await manager.installPackage(org.id, "teamvision-recruiting", {
    coverageRadiusMiles: 25
  });

  const validationBeforeConnectors = await manager.validateOrganization(org.id);
  assert.strictEqual(validationBeforeConnectors.valid, true);

  await manager.configureConnector(org.id, "messenger", {
    enabled: true,
    credentialsRef: "vault://acme/messenger",
    health: "connected",
    defaultOfficeId: withOffices.locations[0].id
  });
  await manager.configureConnector(org.id, "google-calendar", {
    enabled: true,
    credentialsRef: "vault://acme/google-calendar",
    health: "connected",
    defaultOfficeId: withOffices.locations[0].id
  });
  await manager.configureConnector(org.id, "zoom", {
    enabled: true,
    credentialsRef: "vault://acme/zoom",
    health: "connected",
    defaultOfficeId: withOffices.locations[0].id
  });
  console.log("✓ Connector configuration");

  const packageConfig = await manager.getPackageConfiguration(org.id, "teamvision-recruiting");
  assert.ok(packageConfig.organizationName, "Expected package configuration blob");
  assert.ok(packageConfig.branding.primaryColor, "Expected branding available to packages");

  registerTeamVisionRecruitingPackage({
    eventBus,
    configuration: createDefaultConfiguration({
      organizationName: packageConfig.organizationName,
      primaryOfficeAddress: packageConfig.primaryOfficeAddress,
      officeLocations: packageConfig.officeLocations,
      brandColors: {
        primary: packageConfig.branding.primaryColor,
        accent: packageConfig.branding.accentColor
      }
    })
  });
  console.log("✓ Package installation");

  const validation = await manager.validateOrganization(org.id);
  assert.strictEqual(validation.valid, true);
  console.log("✓ Validation");

  const invalid = validateInvalidOrganization(manager);
  await invalid;
  console.log("✓ Validation failures detected");

  const reloaded = await manager.getOrganization(org.id);
  assert.ok(reloaded.version >= 5, "Expected configuration versions tracked");
  assert.ok(fs.existsSync(CONSOLE_STORE_FILE), "Expected console store persisted");
  console.log("✓ Persistence");

  const analytics = await getAnalytics();
  assert.ok(analytics.organizations >= 1);
  assert.ok(analytics.offices >= 2);
  assert.ok(analytics.users >= 2);
  assert.ok(analytics.activePackages >= 1);
  assert.ok(analytics.enabledConnectors >= 3);
  console.log("✓ Administration analytics");

  assert.ok(events.created.length >= 1, "Expected organization.created");
  assert.ok(events.packageInstalled.length >= 1, "Expected organization.package.installed");
  assert.ok(events.officeCreated.length >= 2, "Expected organization.office.created");
  assert.ok(events.userCreated.length >= 2, "Expected organization.user.created");
  assert.ok(events.configurationChanged.length >= 5, "Expected organization.configuration.changed");
  console.log("✓ Events emitted");

  console.log("\nVerifying Atlas Core and Release 1.1 remain green...\n");

  const scripts = [
    "backend/dev/verifyRelease1_1.js",
    "backend/dev/verifyJourney7.js",
    "backend/dev/verifyJourney6.js"
  ];

  for (const script of scripts) {
    execSync(`node ${script}`, { stdio: "inherit", cwd: path.join(__dirname, "..", "..") });
  }

  console.log("\n✓ Atlas Core unchanged");
  console.log("✓ Release 1.1 unchanged");
  console.log("✓ Previous verification suites remain green");
  console.log("\nAll Release 1.2 checks passed.");
}

async function validateInvalidOrganization(manager) {
  const badOrg = await manager.createOrganization({
    profile: {
      name: "Invalid Org",
      primaryLanguage: "en"
    }
  });

  await manager.configureBranding(badOrg.id, {
    primaryColor: "not-a-color"
  });

  await manager.installPackage(badOrg.id, "teamvision-recruiting");

  const result = await manager.validateOrganization(badOrg.id);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((entry) => entry.field.includes("branding.primaryColor")));
  assert.ok(result.errors.some((entry) => entry.message.includes("requires at least one office")));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
