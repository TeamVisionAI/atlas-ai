# RFC-006 — Organization Model

**Status:** FROZEN  
**Version:** 1.0  
**Related:** Release 1.2 · [RFC-005](./RFC-005-package-manifest.md)

---

## Purpose

Define the **permanent organization configuration model** for the Organization Console.

Everything that changes between organizations belongs in this model.

---

## Organization Record

| Section | Fields | Description |
|---------|--------|-------------|
| **Profile** | name, legalName, description, website, primaryLanguage, supportedLanguages, timeZone, dateFormat, phone, email, businessType | Identity |
| **Branding** | logo, primaryColor, secondaryColor, accentColor, backgroundColor, typography, emailSignature, footer, socialLinks | Presentation |
| **Locations** | offices[] — name, address, timeZone, workingHours, meetingCapacity, interviewAvailability, calendarMapping, zoomMapping, defaultLanguage, status | Multi-office |
| **Users** | users[] — name, email, role, officeId, language, status, permissions | Team |
| **Roles** | owner, administrator, manager, recruiter, trainer, viewer | Default role definitions |
| **Packages** | installed packages — id, enabled, configuration | Package management |
| **Connectors** | messenger, whatsapp, instagram, google-calendar, zoom — enabled, credentialsRef, health, defaultOfficeId | Integrations |
| **Policies** | interviewDurationMinutes, reminderSchedule, businessHours, licensingRequirements, escalationRules, maximumFollowUps, allowedChannels, holidaySchedule | Business rules |
| **Settings** | languages, localization, notificationPreferences, packageDefaults, workflowDefaults | Org-wide settings |

---

## Metadata

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Organization identifier |
| `version` | number | Configuration version (incremented on change) |
| `createdAt` | ISO-8601 | Creation timestamp |
| `updatedAt` | ISO-8601 | Last modification |

---

## Organization Events

| Event | When |
|-------|------|
| `organization.created` | Organization created |
| `organization.updated` | Profile or settings updated |
| `organization.deleted` | Organization removed |
| `organization.package.installed` | Package installed |
| `organization.package.removed` | Package uninstalled |
| `organization.office.created` | Office added |
| `organization.user.created` | User added |
| `organization.configuration.changed` | Any configuration mutation |
| `organization.validation.failed` | Validation rejected configuration |

---

## Invariants

1. **No hardcoded defaults** for organization-specific values in Core or packages.
2. **Validation before persistence** — ConfigurationValidator returns structured errors.
3. **Configuration history** — last 200 changes retained.
4. **Separate from Journey #1 onboarding store** — `organizationConsole.json` is the Release 1.2 store.

---

## Non-Goals (Version 1)

- Authentication implementation
- Authorization UI
- Multi-tenancy infrastructure

---

## Reference

`backend/organizations/` — OrganizationManager, OrganizationStore

**Verify:** `node backend/dev/verifyRelease1_2.js`
