# Navigation Map — Atlas Frontend

**Last Updated:** 2026-07-21  
**Related:** [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md)

---

## Navigation Tree

```
/  (Public)
├── /privacy
├── /legal
├── /terms
│
/onboarding  (OnboardingOutlet — unauthenticated flow)
├── /onboarding/signup
├── /onboarding/login
├── /onboarding/organization
├── /onboarding/meta
├── /onboarding/calendar
├── /onboarding/meeting-preferences
└── /onboarding/activate
│
/app  (AppOutlet — requires activated org)
├── /app  [SimpleDashboardLayout] → HomeDashboard
│
└── /app/*  [MainLayout — sidebar nav]
    ├── /app/executive → ExecutiveDashboard  ⚠ NOT IN NAV
    ├── /app/mission-control → Dashboard (Mission Control)
    ├── /app/prospect-workspace/:phone → ProspectWorkspace
    ├── /app/prospect-center → ProspectCenter
    ├── /app/quick-capture → QuickCapture
    ├── /app/prospect/:id → Prospect (legacy)
    ├── /app/conversations → PlaceholderPage
    ├── /app/appointments → PlaceholderPage
    ├── /app/follow-ups → PlaceholderPage
    ├── /app/analytics → PlaceholderPage
    ├── /app/settings → PlaceholderPage
    └── /app/settings/whatsapp → WhatsAppConnect
```

---

## Sidebar Navigation (`missionControlNav.js`)

| # | Label (i18n key) | Path | Renders | Status |
|---|------------------|------|---------|--------|
| 1 | navExecutiveDashboard | `/app` | **HomeDashboard** | ⚠ Label mismatch |
| 2 | navQuickCapture | `/app/quick-capture` | QuickCapture | ✅ |
| 3 | navMissionControl | `/app/mission-control` | Dashboard | ✅ |
| 4 | navProspectCenter | `/app/prospect-center` | ProspectCenter | ✅ |
| 5 | navConversations | `/app/conversations` | Placeholder | 🔲 |
| 6 | navAppointments | `/app/appointments` | Placeholder | 🔲 |
| 7 | navFollowUps | `/app/follow-ups` | Placeholder | 🔲 |
| 8 | navAnalytics | `/app/analytics` | Placeholder | 🔲 |
| 9 | navSettings | `/app/settings` | Placeholder | 🔲 |

**Missing from nav:** `/app/executive` (ExecutiveDashboard)

---

## Layout Navigation Elements

### MainLayout

| Element | Behavior |
|---------|----------|
| Sidebar | Desktop persistent; tablet collapsible; phone drawer |
| NavLink items | From `missionControlNav` |
| Language toggle | ES ↔ EN |
| Public link | "← Team Vision Financial" → `/` |
| Session bootstrap | `bootstrapAtlasSession()` on mount |

### SimpleDashboardLayout

| Element | Behavior |
|---------|----------|
| Header | User name, org name, sign out |
| No sidebar | Intentional — post-activation landing |

### Public Navbar

| Element | Behavior |
|---------|----------|
| Section links | About, Services, Careers, Contact (anchor) |
| Sign In | → `/onboarding` |
| Mobile menu | Hamburger drawer |

---

## Breadcrumbs

**Not implemented** anywhere in the app.

---

## Search

**Not implemented.** ProspectCenter has client-side filter — not global search.

---

## Notifications

**Not implemented.** No notification bell or inbox.

---

## User Menu

| Location | Contents |
|----------|----------|
| SimpleDashboardLayout | Sign out only |
| MainLayout | No dedicated user menu — language toggle only |

---

## Quick Actions

| Location | Actions |
|----------|---------|
| HomeDashboard | Links to attention items |
| NextActions component | Context-specific action buttons |
| QuickCapture | Dedicated nav item |

---

## Organization Selector

**Not implemented.** Single org from AuthContext; no switcher.

---

## Package Navigation

**Not implemented.** No UI for installed packages (Release 1.2 backend exists).

---

## Role Navigation

**Not implemented.** No role-based nav filtering (Release 1.2 roles exist in backend only).

---

## Legacy Redirects

| Legacy path | Redirects to |
|-------------|--------------|
| `/mission-control` | `/app/mission-control` |
| `/prospect-center` | `/app/prospect-center` |
| `/prospect-workspace/:phone` | `/app/prospect-workspace/:phone` |
| `/quick-capture` | `/app/quick-capture` |
| `/conversations` | `/app/conversations` |
| `/appointments` | `/app/appointments` |
| `/follow-ups` | `/app/follow-ups` |
| `/analytics` | `/app/analytics` |
| `/settings` | `/app/settings` |
| `/settings/whatsapp` | `/app/settings/whatsapp` |
| `/pipeline` | `/app/prospect-center` |
| `/prospect/:id` | `/app/prospect/:id` |

**Must preserve** during navigation redesign for bookmarks.

---

## Authentication Flow Navigation

```mermaid
flowchart TD
    A[User visits /app] --> B{Authenticated?}
    B -->|No| C[/onboarding/login]
    B -->|Yes| D{Org activated?}
    D -->|No| E[Resume onboarding step]
    D -->|Yes| F[/app HomeDashboard]
    C --> G[Login/Signup]
    G --> H[Organization → Meta → Calendar → Prefs → Activate]
    H --> F
```

**Guard:** `OnboardingGuard.jsx` — `OnboardingOutlet`, `AppOutlet`

---

## Scalability Assessment

| Concern | Current | Risk | Recommendation |
|---------|---------|------|----------------|
| Flat sidebar (9 items) | OK | Medium at 15+ items | Group into sections |
| Placeholder items in nav | 5 of 9 | **High** — user trust | Hide until built or badge "Soon" |
| Label/route mismatch | Executive vs Home | **High** | Rename or reroute |
| No role-based nav | All users see all | Medium | Filter by role when auth UI exists |
| No org switcher | Single tenant | Low for MVP | Add for multi-org future |
| Deep linking | Good — phone-based workspace | Low | Keep |
| Legacy redirects | Comprehensive | Low | Maintain indefinitely |

---

## Recommended Future Navigation Structure

```
/app
├── Home (or Executive — product decision)
├── Operations
│   ├── Mission Control (live — Release 1.4 UI)
│   ├── Prospect Center
│   └── Conversations (when built)
├── Intelligence
│   ├── Daily Brief
│   └── Analytics
├── Capture
│   └── Quick Capture
└── Settings
    ├── Organization
    ├── Connectors (WhatsApp, Calendar, Zoom)
    └── Team
```

This grouping supports Design System v1 sidebar sections without adding complexity prematurely.
