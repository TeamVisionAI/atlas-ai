# Release 1.2 — Organization Console

**Status:** IMPLEMENTED

Administration layer for configuring and operating Atlas without code changes.

## Principle

Everything that changes between organizations belongs in configuration. Nothing organization-specific belongs in Atlas Core or inside packages.

## Domain

`backend/organizations/`

| Module | Responsibility |
|--------|----------------|
| `OrganizationManager.js` | Console orchestrator |
| `OrganizationRegistry.js` | Organization registry |
| `OrganizationConfiguration.js` | Unified configuration assembly |
| `OrganizationProfile.js` | Organization profile |
| `OrganizationBranding.js` | Branding settings |
| `OrganizationLocations.js` | Office locations |
| `OrganizationUsers.js` | User management models |
| `OrganizationRoles.js` | Default roles and permissions |
| `OrganizationPackages.js` | Package install/configure |
| `OrganizationConnectors.js` | Connector settings |
| `OrganizationPolicies.js` | Business policies |
| `OrganizationSettings.js` | Organization settings |
| `ConfigurationValidator.js` | Configuration validation |
| `OrganizationStore.js` | Persistence |
| `OrganizationAnalytics.js` | Administration metrics |

## Usage

```javascript
const { createOrganizationManager } = require("./backend/organizations");

const manager = createOrganizationManager({ eventBus });
const org = await manager.createOrganization({
  profile: { name: "Acme Recruiting", primaryLanguage: "en", supportedLanguages: ["en", "es"] }
});

await manager.addOffice(org.id, { name: "Primary Office", address: "..." });
await manager.installPackage(org.id, "teamvision-recruiting", { coverageRadiusMiles: 25 });
const packageConfig = await manager.getPackageConfiguration(org.id, "teamvision-recruiting");
```

## Events

- `organization.created`
- `organization.updated`
- `organization.deleted`
- `organization.package.installed`
- `organization.package.removed`
- `organization.office.created`
- `organization.user.created`
- `organization.configuration.changed`
- `organization.validation.failed`

## Verify

```bash
node backend/dev/verifyRelease1_2.js
node backend/dev/verifyRelease1_1.js
```

## Out of scope

Authentication, authorization UI, Mission Control, Executive Dashboard, Marketplace, billing, SSO.
