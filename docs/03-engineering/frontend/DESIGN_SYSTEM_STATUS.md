# Design System Status — Atlas Frontend

**Last Updated:** 2026-07-21  
**Related:** [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md)

**Verdict:** No formal design system exists. Partial tokens in `index.css`; page-level CSS defines independent styles.

---

## Current State

| Element | Status | Location | Consistency |
|---------|--------|----------|-------------|
| Design tokens | Partial | `index.css` `:root` | Low — not used everywhere |
| Component library | None | — | — |
| Tailwind | Not installed | — | — |
| Storybook | None | — | — |
| Figma link | Not documented | — | — |

---

## Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--sans` | system-ui, Segoe UI, Roboto | Global body |
| `--heading` | Same as sans | h1, h2 |
| `--mono` | ui-monospace, Consolas | code blocks |
| Base size | 18px (16px ≤1024px) | `:root` |
| h1 | 56px → 36px mobile | Public + some pages |
| h2 | 24px → 20px mobile | Sections |

**Issues:**
- Page CSS overrides font sizes independently (`ExecutiveDashboard.css`, `MissionControl.css`)
- No type scale document (h3–h6 ad hoc)
- No font files — system fonts only

**Recommendation:** Define 8-step type scale in Design System v1.

---

## Spacing & Grid

| Approach | Details |
|----------|---------|
| Global grid | None defined |
| Spacing unit | Ad hoc px/rem per CSS file |
| Layout max-width | `#root` full width; public sections use custom max-width in `PublicSection.css` |
| App layout | MainLayout sidebar + content flex |

**Issues:** No 4px/8px spacing scale. Inline styles use arbitrary values.

---

## Colors

### Global tokens (`index.css`)

| Token | Light | Dark (prefers-color-scheme) |
|-------|-------|----------------------------|
| `--text` | #6b6375 | #9ca3af |
| `--text-h` | #08060d | #f3f4f6 |
| `--bg` | #fff | #16171d |
| `--border` | #e5e4e7 | #2e303a |
| `--accent` | #aa3bff | #c084fc |
| `--accent-bg` | rgba purple 0.1 | rgba purple 0.15 |

### Page-specific palettes

| File | Notes |
|------|-------|
| ExecutiveDashboard.css | Independent blues, greens, slate |
| MissionControl.css | Agent workspace colors |
| HomeDashboard.css | Card colors |
| Onboarding.css | Form focus states |
| Public*.css | Marketing brand colors |

**Issues:** ~4 parallel color systems. Executive dashboard does not use `--accent`.

---

## Borders, Radius, Shadows

| Property | Global | Page-level |
|----------|--------|------------|
| Border radius | 4px (code) | 8–16px cards (varies) |
| Shadows | `--shadow` token | Multiple custom box-shadows |
| Borders | `--border` token | Often hardcoded `#E5E7EB` |

---

## Icons

| Method | Usage |
|--------|-------|
| Emoji | Navigation (☰), status (✅), sections (🚀) |
| Unicode arrows | Sidebar collapse |
| SVG | `favicon.svg` only; `icons.svg` unused |

**Recommendation:** Adopt Lucide or Heroicons. Remove emoji from operational UI.

---

## Charts

**No chart library.** Visualizations:

| Component | Method |
|-----------|--------|
| InterviewPipeline | CSS flex steps |
| AgencyHealth | Score + label |
| AgentMetricPanel | Mock list data |

**Recommendation:** Lightweight chart library (Recharts or Chart.js) for DS v1 analytics components.

---

## Buttons

| Source | Variants |
|--------|----------|
| PrimaryButton.jsx | Public CTA (`.public-site__button`) |
| OnboardingLayout | `.onboarding-button`, `.onboarding-button--secondary` |
| NextActions.tsx | Inline action buttons |
| MainLayout | Sidebar buttons |
| Inline styles | Prospect.jsx, PlaceholderPage |

**Issues:** No shared Button component. No disabled/loading variants standard.

---

## Inputs & Forms

| Source | Pattern |
|--------|---------|
| OnboardingLayout | `OnboardingInput`, labels, errors |
| QuickCapture | Custom classes |
| Contact.jsx | Public form fields |
| OutcomeWizard | Select + text inputs |
| ActivityFeed | Note textarea |

**No form library** (React Hook Form, Formik). No shared validation UI.

---

## Tables

| Location | Implementation |
|----------|----------------|
| TeamInterviewBoard | `.executive-table` |
| InfoCard / InterviewCard | Inline styled `<table>` |
| ProspectCenter | Article list (not table) |

**No shared Table component.** Not responsive on mobile (horizontal scroll risk).

---

## Cards

| Pattern | Used by |
|---------|---------|
| `.dashboard-card` | HomeDashboard |
| `.executive-card` | Executive components |
| `.prospect-center__row` | ProspectCenter |
| `.info-card` style objects | Prospect.jsx |
| OnboardingCard | Onboarding |

---

## Animations

| Type | Usage |
|------|-------|
| CSS transitions | Sidebar drawer, hover states |
| Skeleton pulse | ExecutiveDashboard `.executive-skeleton` |
| Reduced motion | **Not implemented** |

---

## Dark Mode

| Mode | Support |
|------|---------|
| System (`prefers-color-scheme`) | Yes — `index.css` tokens |
| User toggle | **No** |
| Page CSS dark variants | Partial — executive/Mission Control may not adapt |

---

## Responsive Behavior

Breakpoints used:

| Breakpoint | Usage |
|------------|-------|
| 767px | MainLayout phone |
| 768–1023px | Tablet |
| 1024px | Desktop, font size change |

See [RESPONSIVE_AUDIT.md](./RESPONSIVE_AUDIT.md).

---

## Consistency Score: **45 / 100**

### Top Inconsistencies

1. Four parallel color palettes
2. Three button implementations
3. Emoji vs no icon system
4. Inline styles vs CSS classes vs tokens
5. No shared spacing scale
6. Dark mode incomplete outside `index.css`
7. Loading states differ per page (skeleton vs text vs none)

---

## Design System v1 Recommendations

1. **Token file** — Export CSS variables + JSON for Figma sync
2. **Primitives** — Button, Input, Select, Card, Badge, Alert, Skeleton
3. **Patterns** — PageHeader, EmptyState, DataTable, MetricCard, Timeline
4. **Layouts** — AppShell, OnboardingShell, PublicShell (extract from existing)
5. **Icons** — Lucide React
6. **Documentation** — Storybook with ES/EN examples

**Do not adopt Tailwind mid-redesign** unless team commits — current codebase is plain CSS.
