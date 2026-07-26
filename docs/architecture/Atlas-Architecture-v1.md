# Atlas Architecture v1.0

**Sprint 18.2 — Configuration & Scheduling Foundation**

This document describes the workspace architecture freeze for Atlas AI as a Recruiting Operating System.

---

## Workspace Architecture

Every user owns an independent workspace organized into three pillars:

| Pillar | Purpose | Modules |
|--------|---------|---------|
| **Configuration** | How should Atlas behave? | Profile, Organization, WhatsApp, Scheduling |
| **Operations** | What should I do now? | Executive Dashboard, Quick Capture, Mission Control, Prospect Center, Conversations, Appointments, Follow-ups, Operations Center |
| **Intelligence** | What should I know? | Analytics, Knowledge Hub |

Routes:

- Configuration: `/app/settings/*`
- Operations: `/app/mission-control`, `/app/quick-capture`, etc.
- Intelligence: `/app/analytics`, `/app/knowledge`

---

## Configuration Module

### Profile

User-level workspace settings stored on `atlas_users.profile_settings`:

- First Name, Last Name, Email, Phone
- Timezone, Language
- Business Hours
- Default Office

API: `GET/PATCH /api/configuration/profile`

### Organization

Organization identity and branding stored on `organizations` + `organization_settings`:

- Organization Name, Owner, Organization Level (RVP/SVP/NSD/SNSD — informational)
- Office Name, Brand Name, Logo, Primary/Secondary Color

Future policy placeholders (hidden in UI, present in data model):

- Shared Recruiting
- Lead Distribution
- Organization Policies
- Capacity Rules

API: `GET/PATCH /api/configuration/organization`

### WhatsApp

Reuses existing Meta Embedded Signup implementation.

Displays: Connection Status, Business Phone, Reconnect, Disconnect, Last Sync.

API: `GET /api/configuration/whatsapp` (status summary)

### Scheduling

Organization scheduling settings in `organization_settings.settings.scheduling`:

- Google Account integration (`organization_integrations` provider `google_calendar`)
- Calendar selection
- Working Hours, Preferred Appointment Hours
- Maximum Concurrent Business Appointments
- Allow Business Overlap, Respect Personal Calendar

API: `GET/PATCH /api/configuration/scheduling`

Google OAuth:

- `GET /api/configuration/scheduling/google/auth-url`
- `GET /api/configuration/scheduling/google/callback`
- Stores `refreshToken`, `calendarId`, `syncStatus`, `lastSync`

**Sync direction:** One-way push from Atlas → Google Calendar (no two-way sync yet).

---

## Organization Model

```
Organization
  id
  name
  ownerId
  organizationLevel   // RVP | SVP | NSD | SNSD (informational)
  branding            // logo, colors, brand name
  settings            // scheduling + future policies
  createdAt
  updatedAt
```

Organization level is **informational today**. Never hardcode business logic based on level.

### Permissions (separate from hierarchy)

| User Roles | Notes |
|------------|-------|
| Organization Owner | Full org write |
| Organization Admin | Org configuration |
| Leader | Operations access |
| Agent | Prospect operations |
| Assistant | Future role |

Permissions use the LC1 matrix (`backend/security/permissions.js`). Organization level ≠ user role.

---

## Availability Engine

**Service:** `backend/services/availabilityService.js`

Generic slot generation — no interview-specific logic.

```
Input:  date, duration, appointmentType, organizationId
Output: Available time slots (preferred hours ranked first)
```

Uses organization scheduling settings + capacity engine for concurrent booking limits.

---

## Scheduling Engine

**Service:** `backend/services/schedulingService.js`

Generic appointment scheduling for all types:

- Interview, FNA, Policy Delivery, Orientation, Training, Meeting, Coaching

```
scheduleAppointment({ organizationId, appointmentType, dateKey, timeKey, duration, metadata })
```

Books capacity slot and pushes event to Google Calendar when connected.

---

## Mission Control Responsibilities

Mission Control is an **operations** surface. Sprint 18.2 adds availability requests:

```
GET /api/mission-control/:phone/availability?date=&duration=&appointmentType=
→ { suggestedSlots: [...] }
```

Mission Control may request `AvailabilityService` for suggested time slots. No scheduling UI required in this sprint.

Mission Control does **not** own configuration — it consumes organization scheduling settings.

---

## Conversation Responsibilities

Conversations are **history only**:

- Timeline of messages and events
- No forms, workflow logic, or AI controls in the Conversations module

Workflow actions belong in Mission Control.

---

## Follow Up Responsibilities

Follow Ups are **human tasks only**:

- Never place automated workflow tasks inside Follow Ups
- Workflow-generated tasks stay in Mission Control / workflow engines

---

## Service Layout

```
backend/
  core/configuration/
    organizationLevels.js
    appointmentTypes.js
    userRoles.js
  services/
    profileService.js
    organizationService.js
    availabilityService.js
    schedulingService.js
    googleCalendarIntegrationService.js
  routes/
    configuration.js

frontend/src/
  pages/configuration/
    ConfigurationLayout.jsx
    ConfigurationHub.jsx
    ProfileConfiguration.jsx
    OrganizationConfiguration.jsx
    SchedulingConfiguration.jsx
  services/
    configurationService.js
```

---

## Database

Migration `012_configuration_scheduling.sql`:

- `organizations.organization_level`, `brand_name`, `office_name`
- `atlas_users.profile_settings` JSONB
- Default scheduling + policy placeholders in `organization_settings`

Google credentials stored in `organization_integrations.credentials_encrypted`.

---

## Definition of Done (Sprint 18.2)

- [x] Configuration module exists at `/app/settings`
- [x] Profile, Organization, WhatsApp (migrated), Scheduling pages
- [x] Google OAuth flow + calendar selection
- [x] Scheduling settings persist
- [x] AvailabilityService returns available slots
- [x] Mission Control can request available slots
- [x] Architecture documentation updated
