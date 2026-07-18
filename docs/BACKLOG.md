# Atlas Product Backlog

## Locked releases

### Sprint 10.1 — Quick Capture (`v0.1.0-alpha`)

**Status:** LOCKED — First Working Prospect Capture  
**Change policy:** No modifications unless real user feedback or a genuine usability issue. Run `verifySprint10_1.js` before any change.

---

## UI Platform

### Reusable UI component library (Quick Capture follow-up)

**Priority:** Post v0.1.0-alpha  
**Status:** Backlog  
**Context:** Sprint 10.1 Quick Capture introduced page-specific form styling (`QuickCapture.css`) and inline patterns. Over time, Atlas should extract shared primitives to avoid page-specific UI drift.

**Scope:**

- Form field (`AtlasField`) — label, input, error
- Segmented control (`AtlasSegmentedControl`)
- Primary / secondary buttons (`AtlasButton`)
- Dialog / overlay (`AtlasDialog`)
- Banner (`AtlasBanner`) — success, error, info
- Compact form shell (`AtlasFormCard`) — mobile-first, centered desktop panel

**Acceptance:**

- Quick Capture refactored to use shared components without visual regression
- Mission Control and Executive Dashboard can adopt incrementally
- Bilingual labels continue via existing `LanguageContext`

**Out of scope:** Full design-system documentation, Storybook, or unrelated page redesigns.

### i18n polish (Sprint 10.1.1)

**Priority:** Sprint 10.1.1 (polish — does not block Sprint 10.2)  
**Status:** In progress  
**Context:** Global i18n UX revision (nav, page chrome, Mission Control labels) is approved and merged into the standard in [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md). Three gaps remain; treat as incremental polish, not a gate for 10.2.

**Scope:**

1. ~~Quick Capture: remove communication language selector; default from UI language; rename source field; edit language in Prospect Workspace Details~~ (done)
2. `OutcomeWizard.jsx` — wizard steps, field labels, save buttons
3. Backend-generated copy — activity timeline summaries, AI brief body, recommendation reasons (client mapping or backend keys)
4. Mock metric panel data — statuses in `metricsEngine.js` (e.g. Confirmed, Due Now)

**Acceptance:**

- No mixed English/Spanish in the above surfaces when UI language toggles
- Keys in both `es` and `en` in `translations.js`

### Prospect Workspace components (Sprint 10.2)

**Priority:** Sprint 10.2  
**Status:** Specified in [SPRINT_10_2_PROSPECT_WORKSPACE.md](./SPRINT_10_2_PROSPECT_WORKSPACE.md) — **pending final approval**

**UX principle:** Execution workspace, not record viewer. Layout follows five-question order (Identity → Journey → Actions → Activity Feed → Details).

- `ProspectIdentityStrip` — Q1
- `JourneyProgress` — Q2 visual stepper
- `ActivityFeed` / `ActivityFeedItem` — Q4 unified chronological activity (replaces Notes + Timeline)
- `ProspectDetailsPanel` — Q5 collapsible details
- `AtlasCoachPlaceholder` — Q5 coach panel shell
