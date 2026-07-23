# UX Debt — Atlas Frontend

**Last Updated:** 2026-07-21  
**Related:** [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md)

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| 🔴 Critical | Blocks user trust or causes confusion |
| 🟠 High | Significant friction or maintenance cost |
| 🟡 Medium | Polish / consistency issues |
| 🟢 Low | Cleanup when convenient |

---

## Duplicate Pages & Routes

| Issue | Severity | Details |
|-------|----------|---------|
| HomeDashboard vs ExecutiveDashboard | 🔴 | Nav says "Executive Dashboard" but `/app` shows Home; real Executive at `/app/executive` unlinked |
| Prospect.jsx vs ProspectWorkspace | 🟠 | Two prospect detail experiences; legacy page inferior |
| Dashboard.jsx naming | 🟡 | File named Dashboard but IS Mission Control; confuses developers |

---

## Unused Components (Dead Code)

| File | Severity |
|------|----------|
| ActionCard.jsx (empty) | 🟢 |
| Header.jsx | 🟢 |
| Sidebar.jsx | 🟢 |
| StatCard.jsx | 🟢 |
| AppointmentCard.jsx | 🟢 |
| AtlasRecommendation.tsx | 🟢 |
| WorkflowGateModal.jsx | 🟡 |
| ProspectCard.jsx | 🟢 |
| QuickActions.tsx | 🟢 |
| AIRecommendationCard.jsx | 🟡 |
| NotesCard.jsx | 🟡 |

---

## Placeholder Screens

| Route | Nav visible | Severity |
|-------|-------------|----------|
| /app/conversations | Yes | 🔴 |
| /app/appointments | Yes | 🔴 |
| /app/follow-ups | Yes | 🔴 |
| /app/analytics | Yes | 🔴 |
| /app/settings | Yes | 🟠 |
| Coach section (ProspectWorkspace) | No | 🟡 |
| Google Sign-In (SignupPage) | No | 🟡 |
| Legal page compliance TODOs | No | 🟡 |

**Impact:** 56% of sidebar nav items (5/9) lead to "coming soon" pages.

---

## Temporary Implementations

| Item | Location | Should become |
|------|----------|---------------|
| Mock queue placeholders | queueEngine.js | Real Mission Control API |
| Mock metric panels | metricsEngine.js | Release 1.4 metrics |
| Client-side morning brief | executiveDashboardViewModel.js | Release 1.3 Daily Brief API |
| Workflow gate localStorage | workflowEngine.js | Server-side workflow state |
| Bootstrap token dev login | atlasAuthService.js | Dev-only; document clearly |
| Inline styles | Prospect.jsx, PlaceholderPage | DS v1 components |

---

## Hardcoded Values

| Value | Location |
|-------|----------|
| "Niovel Perez" | ProspectCard.jsx |
| Demo queue entries | queueEngine.js |
| Mock interview/follow-up counts | metricsEngine.js |
| Static AI recommendation text | AIRecommendationCard.jsx |
| Production API URL fallback | apiClient.js (Railway) |

---

## Inconsistent Navigation

| Issue | Severity |
|-------|----------|
| Executive label → wrong page | 🔴 |
| ExecutiveDashboard orphaned | 🟠 |
| ProspectCenter links to `/mission-control` not `appPath()` | 🟡 |
| Public "Sign In" → onboarding not /app | 🟢 (intentional) |
| Home uses SimpleDashboardLayout; everything else MainLayout | 🟡 |

---

## Broken or Weak Flows

| Flow | Issue | Severity |
|------|-------|----------|
| Legacy /prospect/:id | Inferior UX vs workspace | 🟠 |
| Settings hub | Placeholder; only WhatsApp sub-route works | 🟠 |
| Error recovery | Prospect.jsx no error state | 🟡 |
| Session expiry | No explicit re-login prompt UX | 🟡 |
| Onboarding resume | Works via guard but no progress indicator | 🟡 |

---

## Visual Inconsistencies

| Area | Issue |
|------|-------|
| Colors | 4 parallel palettes (index.css, executive, mission control, public) |
| Buttons | 3+ button styles |
| Cards | 5+ card patterns |
| Loading | Skeleton vs "Loading..." vs emoji vs none |
| Errors | CSS classes vs inline red text vs none |
| Icons | Emoji vs text vs none |
| Typography | Global h1/h2 vs page overrides |

---

## Unused CSS

| File | Status |
|------|--------|
| App.css | Vite boilerplate — never imported |
| icons.svg | Unused asset |
| Partial executive CSS | Some classes may be unused after audit |

---

## Unused Assets

| Asset | Path |
|-------|------|
| hero.png | src/assets/ |
| react.svg | src/assets/ |
| vite.svg | src/assets/ |
| icons.svg | public/ |

---

## Unused Service Exports

| Export | File |
|--------|------|
| fetchCurrentUser | atlasAuthService.js (imported, never called) |
| getExecutiveRecommendations | executiveDashboardService.js |
| getExecutiveActivity | executiveDashboardService.js |
| hasSession | onboardingService.js |

---

## Dead Code in Engines

| Pattern | File |
|---------|------|
| Mock placeholder injection | queueEngine.js |
| Hardcoded panel data | metricsEngine.js |
| Coach "coming soon" | prospectWorkspaceViewModel.js |

---

## Technical Debt Summary

| Category | Items | Est. cleanup effort |
|----------|-------|---------------------|
| Dead components | 11 | 2–4 hours |
| Dead assets/CSS | 5 | 1 hour |
| Unused exports | 4 | 1 hour |
| Nav fixes | 3 | 4–8 hours |
| Placeholder routes | 5 | Product decision + build or hide |
| Mock → API migration | 4 engines | 2–3 weeks (with backend routes) |

---

## Recommended Cleanup Order

1. 🔴 Fix nav label/route mismatch (Executive vs Home)
2. 🔴 Hide or badge placeholder nav items
3. 🟠 Delete confirmed dead components
4. 🟠 Deprecate Prospect.jsx → redirect to workspace
5. 🟡 Wire ExecutiveDashboard to nav or merge with Home
6. 🟡 Standardize loading/error patterns
7. 🟢 Remove unused assets and App.css

---

## Debt Score: **High**

Estimated **~15% of frontend codebase** is dead, placeholder, or mock-driven. Acceptable for MVP; must address before Design System v1 launch.
