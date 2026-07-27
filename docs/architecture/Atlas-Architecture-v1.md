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

### Appointment Engine (Sprint 22)

**Application service:** `backend/application/appointmentApplicationService.js`  
**Scheduling authority:** `backend/services/appointmentSchedulingEngine.js`  
**Reminder delivery:** `backend/services/appointmentReminderEngine.js` (confirmation, 24h, 1h, 15m via WhatsApp)  
**Persistence:** `atlas_appointments` (migration `013`) with JSON fallback in development  
**Agent profile:** `atlas_users.profile_settings.appointmentProfile` via `appointmentProfileService.js`

Sprint 22.1 production polish:

- **Team Vision Zoom-first** — no provider choice in conversation; in-person/unusual methods escalate to Human Assist
- **Structured history** — lifecycle events with actor, reason, old/new values
- **Human Assist UX** — Mission Control-style panel in Appointments tab
- **Modal workflows** — reschedule/cancel/complete/resolve without browser prompts
- **Favorite locations CRUD** — in appointment settings profile

```
GET/PATCH /api/appointments/profile
GET     /api/appointments/availability
GET     /api/appointments?view=today|upcoming|...
POST    /api/appointments
POST    /api/appointments/:id/reschedule|cancel|complete|human-assist
```

The scheduling engine is the **sole authority** for suggested slots. Inputs: agent recurring working schedule, duration, buffers, existing appointments, optional Google Calendar FreeBusy. Mission Execution (Sprint 21) persists appointment rows after booking via `createAppointment({ existingBooking, skipWorkflowSideEffects: true })`.

**Team Vision default:** Zoom-first virtual interviews; Human Assist escalates to Mission Control when Zoom or scheduling exceptions cannot be resolved automatically.

**UI:** `/app/appointments` (list views), `/app/settings/appointments` (agent appointment profile).

See `backend/test/sprint22.test.js` and `backend/dev/verifySprint22.js`.

---

## Mission Control Responsibilities

Mission Control is an **operations** surface. Sprint 18.2 adds availability requests:

```
GET /api/mission-control/:phone/availability?date=&duration=&appointmentType=
→ { suggestedSlots: [...] }
```

Mission Control may request `AvailabilityService` for suggested time slots. No scheduling UI required in this sprint.

Mission Control does **not** own configuration — it consumes organization scheduling settings.

### Mission Engine (Sprint 18.3)

Mission Control is an **orchestration UI**. Mission Engine (`backend/core/missionEngine.js`) decides what the recruiter should do next.

See [Mission Engine v1](./Mission-Engine-v1.md) for lifecycle, API, and business rules.

### Platform Consolidation (Sprint 19)

Sprint 19 hardened production readiness without changing the approved architecture:

- **Tenant isolation** — all dashboard, mission, and prospect-center reads scoped by session organization
- **Backend authority** — Mission Control queue from `prioritizedWorkflowQueue`; gate from backend `workflowGate`
- **Dependency direction** — `missionControlReadModel.js` and `agentActionApplicationService.js` extracted; core engines no longer import controllers
- **Production validation** — startup fails on missing secrets/tables; no silent in-memory fallback in production

See [Platform Consolidation Sprint 19](./Platform-Consolidation-Sprint-19.md).

### Tenant Isolation Completion (Sprint 19.1)

Sprint 19.1 closes authenticated tenant-isolation gaps identified by independent audit:

- Mission Control live route wired through organization-aware request handler
- Unscoped `findProspect(phone)` removed from authenticated route chains
- Prospect Workspace workflow gate reads backend `workspace.workflowGate.active` only
- Quick Capture duplicate detection scoped per organization
- Negative cross-organization access tests added

See [Platform Consolidation Sprint 19.1](./Platform-Consolidation-Sprint-19.1.md).

**WhatsApp exception:** `findProspectForSystemIngress(phone)` remains for inbound system paths until WhatsApp multi-tenant routing migrates.

**Workflow source of truth:** Backend workflow/agent state (JSON legacy, tenant-scoped at query layer) is authoritative. Frontend `localStorage` is not authoritative for gate, queue, or milestone decisions. Missions remain derived projections.

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
    appointmentDomain.js
    userRoles.js
  services/
    profileService.js
    appointmentProfileService.js
    appointmentSchedulingEngine.js
    organizationService.js
    availabilityService.js
    schedulingService.js
    googleCalendarIntegrationService.js
    reminderAdapterService.js
    zoomMeetingAdapter.js
  application/
    appointmentApplicationService.js
  repositories/
    appointmentRepository.js
  routes/
    configuration.js
    appointments.js

frontend/src/
  pages/
    AppointmentsPage.jsx
  pages/configuration/
    ConfigurationLayout.jsx
    ConfigurationHub.jsx
    ProfileConfiguration.jsx
    OrganizationConfiguration.jsx
    SchedulingConfiguration.jsx
    AppointmentSettings.jsx
  services/
    configurationService.js
    appointmentService.js
```

---

## Database

Migration `012_configuration_scheduling.sql`:

- `organizations.organization_level`, `brand_name`, `office_name`
- `atlas_users.profile_settings` JSONB
- Default scheduling + policy placeholders in `organization_settings`

Google credentials stored in `organization_integrations.credentials_encrypted`.

Migration `013_atlas_appointments.sql`:

- `atlas_appointments` — first-class appointment entity (org-scoped, history JSONB)
- Agent appointment profile in `atlas_users.profile_settings.appointmentProfile`

---

## Definition of Done (Sprint 18.2)

- [x] Configuration module exists at `/app/settings`
- [x] Profile, Organization, WhatsApp (migrated), Scheduling pages
- [x] Google OAuth flow + calendar selection
- [x] Scheduling settings persist
- [x] AvailabilityService returns available slots
- [x] Mission Control can request available slots
- [x] Architecture documentation updated
