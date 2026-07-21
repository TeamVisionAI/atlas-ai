# Page Inventory — Atlas Frontend

**Last Updated:** 2026-07-21  
**Related:** [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md)

---

## Public Pages

| Page | Path | Purpose | Status | Owner | Reusable | Redesign | Remove | Dependencies | Future |
|------|------|---------|--------|-------|----------|----------|--------|--------------|--------|
| Home | `/` | Marketing site | Complete | Public | Yes | Minor polish | No | contactFormService | Keep |
| Privacy | `/privacy` | Privacy policy | Partial (legal TODOs) | Legal | Yes | Content + layout | No | None | Keep |
| Legal | `/legal` | Legal disclosures | Partial | Legal | Yes | Content | No | None | Keep |
| Terms | `/terms` | Terms of service | Partial | Legal | Yes | Content | No | None | Keep |

---

## Onboarding Pages

| Page | Path | Purpose | Status | Owner | Reusable | Redesign | Remove | Dependencies | Future |
|------|------|---------|--------|-------|----------|----------|--------|--------------|--------|
| Welcome | `/onboarding` | Entry CTAs | Complete | Auth | Yes | DS v1 styling | No | None | Keep |
| Signup | `/onboarding/signup` | Email signup | Partial (Google TBD) | Auth | Yes | DS v1 forms | No | AuthContext, atlasAuthService | Keep |
| Login | `/onboarding/login` | Email login | Complete | Auth | Yes | DS v1 forms | No | AuthContext | Keep |
| Organization | `/onboarding/organization` | Create org | Complete | Auth | Yes | Minor | No | onboardingService | Keep |
| Connect Meta | `/onboarding/meta` | WhatsApp signup | Complete | Auth | Yes | Minor | No | metaEmbeddedSignupService, useFacebookSdk | Keep |
| Connect Calendar | `/onboarding/calendar` | Google OAuth | Complete | Auth | Yes | Minor | No | onboardingService | Keep |
| Meeting Preferences | `/onboarding/meeting-preferences` | Location prefs | Complete | Auth | Yes | Minor | No | onboardingService | Keep |
| Activate | `/onboarding/activate` | Final activation | Complete | Auth | Yes | Minor | No | onboardingService | Keep |

---

## Authenticated App Pages

| Page | Path | Purpose | Status | Owner | Reusable | Redesign | Remove | Dependencies | Future |
|------|------|---------|--------|-------|----------|----------|--------|--------------|--------|
| HomeDashboard | `/app` | Post-activation home | Complete | App | Partial | Yes — align with Executive vision | No | onboardingService, AuthContext | **Rename/clarify** vs Executive |
| ExecutiveDashboard | `/app/executive` | Executive recruiting view | Complete, **orphaned** | Executive | Yes | Yes — DS v1, wire Daily Brief API | No | executiveDashboardService, api.js | **Primary executive surface** |
| Dashboard (Mission Control) | `/app/mission-control` | Agent workspace | Complete | Mission Control | Partial | **Major redesign** | No | missionControlService, api, organizationService | Wire Mission Control 1.4 API |
| ProspectCenter | `/app/prospect-center` | Prospect list | Complete | Prospects | Yes | DS v1 tables/cards | No | prospectCenterService | Keep |
| ProspectWorkspace | `/app/prospect-workspace/:phone` | Full prospect workspace | Complete | Prospects | Yes | DS v1 polish | No | prospectWorkspaceService, missionControlService | Keep — primary prospect UI |
| QuickCapture | `/app/quick-capture` | Manual intake | Complete | Prospects | Yes | DS v1 forms | No | quickCaptureService | Keep |
| Prospect (legacy) | `/app/prospect/:id` | Old prospect detail | Partial | Legacy | No | **Replace** | **Yes** → redirect to workspace | prospectService | **Deprecate** |
| WhatsAppConnect | `/app/settings/whatsapp` | Meta settings | Complete | Settings | Yes | DS v1 | No | metaEmbeddedSignupService | Keep |
| PlaceholderPage | 5 routes | Coming soon shell | Placeholder | Various | No | **Replace** with real pages | Eventually | None | Build or remove from nav |

---

## Placeholder Routes (via PlaceholderPage)

| Path | Nav label | Future destination |
|------|-----------|-------------------|
| `/app/conversations` | Conversations | Conversation hub (Mission Control related) |
| `/app/appointments` | Appointments | Calendar/appointments view |
| `/app/follow-ups` | Follow-ups | Follow-up queue |
| `/app/analytics` | Analytics | Package/org analytics |
| `/app/settings` | Settings | Settings hub (WhatsApp is only live sub-route) |

---

## Layouts

| Layout | Used by | Purpose | Reusable |
|--------|---------|---------|----------|
| SimpleDashboardLayout | `/app` index | Minimal header, no sidebar | Yes — post-login landing |
| MainLayout | Most `/app/*` | Sidebar nav, language toggle, mobile drawer | Yes — primary app shell |

---

## Page CSS Files

| CSS | Page |
|-----|------|
| PublicSite.css | Home, legal pages |
| HomeDashboard.css | HomeDashboard |
| ExecutiveDashboard.css | ExecutiveDashboard |
| MissionControl.css | Dashboard (Mission Control) |
| ProspectCenter.css | ProspectCenter |
| ProspectWorkspace.css | ProspectWorkspace |
| QuickCapture.css | QuickCapture |
| WhatsAppConnect.css | WhatsAppConnect |
| Onboarding.css | All onboarding pages |

---

## Status Legend

| Status | Meaning |
|--------|---------|
| Complete | Functional, in production use |
| Partial | Works but incomplete or legacy quality |
| Placeholder | Shell only, no real functionality |

---

**Total pages:** 20 (+ 5 placeholder route instances)
