# Atlas Frontend Audit Report

**Document type:** Design Week — Frontend Architecture Audit  
**Status:** COMPLETE  
**Version:** 1.0  
**Last Updated:** 2026-07-21  
**Audience:** Product, Design, Engineering  

**Related:** [PAGE_INVENTORY.md](./PAGE_INVENTORY.md) · [COMPONENT_INVENTORY.md](./COMPONENT_INVENTORY.md) · [DESIGN_SYSTEM_STATUS.md](./DESIGN_SYSTEM_STATUS.md) · [NAVIGATION_MAP.md](./NAVIGATION_MAP.md) · [UX_DEBT.md](./UX_DEBT.md) · [RESPONSIVE_AUDIT.md](./RESPONSIVE_AUDIT.md) · [ACCESSIBILITY_AUDIT.md](./ACCESSIBILITY_AUDIT.md)

---

## Executive Summary

This audit inventories the entire Atlas frontend as of **Atlas Version 1 Freeze** (`atlas-v1-freeze`). No code was modified. The goal is to establish a baseline for **Atlas Design System v1** and future Executive Dashboard / Mission Control UI work.

### Frontend Maturity Score: **58 / 100**

| Dimension | Score | Notes |
|-----------|-------|-------|
| Feature completeness | 62 | Core flows work; 5 nav routes are placeholders |
| Design consistency | 45 | Multiple styling paradigms; no unified design system |
| Component reusability | 55 | ~55% reusable with redesign; ~15% dead code |
| Technical debt | 50 | Legacy pages, nav mismatches, mock data in engines |
| Accessibility | 48 | Partial ARIA on public/app surfaces; gaps in forms/tables |
| Responsive design | 60 | MainLayout breakpoints exist; legacy pages weak |
| Auth & routing | 72 | Onboarding flow complete; role/permission UI absent |

### Key Findings

**What exists:** React 19 + Vite 8 + React Router 7. Twenty page components, fifty-eight reusable components, thirteen services, ten view-model engines. Working surfaces: public marketing site, onboarding, home dashboard, mission control, prospect center, prospect workspace, executive dashboard (orphaned route), WhatsApp connect.

**What is reusable (~55%):** Onboarding shell, MainLayout sidebar, prospect workspace components, executive dashboard components, public site sections, service layer, view-model engines, i18n infrastructure.

**What should be redesigned (~35%):** Mission Control (`Dashboard.jsx`), legacy `Prospect.jsx`, placeholder pages, inline-styled cards, emoji-based iconography, mock metric panels, navigation labeling.

**What should be removed (~10%):** Empty `ActionCard.jsx`, legacy `Header.jsx`/`Sidebar.jsx`, unused components (`StatCard`, `AppointmentCard`, `AtlasRecommendation`, `WorkflowGateModal`), dead assets, `App.css` boilerplate.

**What is missing:** Design system package, icon library, chart library, form validation library, shared table component, role-based navigation, organization selector, notification center, Mission Control live UI (backend Release 1.4 ready), Daily Brief consumer UI, loading skeleton system, error boundary, dark mode toggle (system-only today).

### Design Consistency

Three visual eras coexist:

1. **Public site** — polished CSS (`Public*.css`), marketing-grade
2. **App shell (MainLayout)** — cohesive `atlas-layout__*` classes, responsive sidebar
3. **Legacy inline** — `Prospect.jsx`, `PlaceholderPage`, parts of Mission Control use inline styles

Global tokens exist in `index.css` (`--accent`, `--text`, `--bg`) but page-level CSS often defines independent color/spacing values (`ExecutiveDashboard.css`, `MissionControl.css`).

### Technical Debt

- Nav label "Executive Dashboard" → `/app` renders **HomeDashboard**, not **ExecutiveDashboard** (`/app/executive` unlinked)
- `queueEngine` and `metricsEngine` inject mock/demo data
- Client-side executive brief built in `executiveDashboardViewModel.js` — backend Release 1.3 Daily Brief not wired
- Mixed JS/TSX (5 TypeScript files, no `tsconfig`)
- No Tailwind, no component library, no Storybook

### Estimated Redesign Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| **Phase A — Foundation** | Design tokens, icon system, base components | 3–4 weeks |
| **Phase B — Navigation & Shell** | Fix nav map, org selector, unified layout | 2 weeks |
| **Phase C — Core App Pages** | Mission Control, Prospect Center, Workspace | 4–6 weeks |
| **Phase D — Intelligence UI** | Executive Dashboard, Daily Brief, Mission Control live | 4–5 weeks |
| **Phase E — Cleanup** | Remove dead code, placeholders, legacy pages | 1–2 weeks |
| **Total** | Design System v1 + primary app surfaces | **14–19 weeks** |

### Reusable Percentage

| Category | Reusable | Redesign | Remove |
|----------|----------|----------|--------|
| Pages (20) | 11 (55%) | 6 (30%) | 3 (15%) |
| Components (58) | 32 (55%) | 18 (31%) | 8 (14%) |
| Services (13) | 11 (85%) | 2 (15%) | 0 |
| Engines (10) | 8 (80%) | 2 (20%) | 0 |

### Top Priorities

1. **Fix navigation truth** — Align labels, routes, and product naming (Executive vs Home vs Mission Control)
2. **Establish Design System v1** — Tokens, typography, buttons, inputs, cards (see DESIGN_SYSTEM_STATUS.md)
3. **Wire intelligence backends** — Daily Brief (1.3) and Mission Control (1.4) to frontend
4. **Remove dead code** — 8+ orphan components, unused assets
5. **Replace placeholder nav routes** — 5 "coming soon" pages visible in sidebar

### Quick Wins

- Delete empty/unused files (`ActionCard.jsx`, `App.css`, legacy Header/Sidebar)
- Add nav link to `/app/executive` or rename HomeDashboard nav label
- Fix `ProspectCenter` links to use `appPath()` consistently
- Remove unused service exports
- Delete Vite default assets (`react.svg`, `vite.svg`)

### High-Risk Areas

- **Mission Control redesign** — Most complex page; tightly coupled to mock engines
- **Navigation restructure** — Affects all authenticated users; legacy redirects must persist
- **Executive Dashboard** — Built but orphaned; product decision needed before Design System work
- **i18n** — All new components must support ES/EN from day one
- **Auth guards** — OnboardingGuard logic must survive layout changes

### Recommendations

1. **Adopt a design system before page redesign** — Tokens first, then primitives, then pages.
2. **Treat engines as the UI boundary** — Keep view-model engines; swap mock data for Release 1.3/1.4 APIs.
3. **Do not redesign Prospect.jsx** — Deprecate in favor of ProspectWorkspace; redirect `/app/prospect/:id`.
4. **Introduce icon library** — Replace emoji icons for professional consistency and a11y.
5. **Add Storybook** — Document components as Design System v1 is built.
6. **Plan Mission Control UI as Release 2.0 frontend** — Consumes `MissionControlEngine` snapshots via new API route (backend work post-freeze).
7. **Keep public site separate** — Marketing CSS can diverge; app shell should unify.

---

## Stack Summary

| Layer | Technology |
|-------|------------|
| Framework | React 19.2 |
| Router | React Router 7.18 |
| Build | Vite 8.1 |
| Styling | Plain CSS (no Tailwind) |
| State | React Context + localStorage |
| i18n | Custom LanguageContext (ES/EN) |
| Charts | None (CSS visualizations) |
| Forms | Native HTML + useState |
| Icons | Emoji (no icon library) |
| Lint | oxlint |

---

## Inventory Summary

| Category | Count | Document |
|----------|-------|----------|
| Pages | 20 | [PAGE_INVENTORY.md](./PAGE_INVENTORY.md) |
| Layouts | 2 | PAGE_INVENTORY |
| Components | 58 | [COMPONENT_INVENTORY.md](./COMPONENT_INVENTORY.md) |
| Services | 13 | PAGE_INVENTORY (dependencies) |
| Engines | 10 | COMPONENT_INVENTORY |
| Contexts | 2 | AuthContext, LanguageContext |
| Hooks | 1 (+2 inline) | useFacebookSdk |
| CSS files | 18 | DESIGN_SYSTEM_STATUS |
| Routes | 35+ | [NAVIGATION_MAP.md](./NAVIGATION_MAP.md) |

---

## Validation Checklist

| Criterion | Status |
|-----------|--------|
| All pages inventoried | ✅ |
| Components documented | ✅ |
| Navigation mapped | ✅ |
| Responsive review complete | ✅ |
| Accessibility review complete | ✅ |
| Design system evaluated | ✅ |
| UX debt documented | ✅ |
| Executive summary produced | ✅ |
| Zero production code modified | ✅ |

---

## Next Steps (Post-Audit)

1. Product decision: Executive Dashboard vs Home Dashboard naming and placement
2. Design System v1 specification (Figma + token JSON)
3. API contract for Mission Control and Daily Brief frontend consumption
4. Phase A implementation planning (Design Week Phase 2 — not in this audit)

**Remember:** You cannot design the future until you fully understand the present.
