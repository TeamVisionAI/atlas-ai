# Accessibility Audit — Atlas Frontend

**Last Updated:** 2026-07-21  
**Related:** [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md)

**Overall accessibility score: 48 / 100**

No formal WCAG audit was performed. This is a code-review-based assessment.

---

## Contrast

| Area | Status | Notes |
|------|--------|-------|
| Global text (`--text` on `--bg`) | ⚠ Likely OK | Gray on white; verify 4.5:1 |
| Headings (`--text-h`) | ✅ Good | Dark on light |
| Accent purple on white | ⚠ Check | `#aa3bff` links/buttons — verify contrast |
| Executive dashboard colors | ⚠ Unknown | Independent palette — not tested |
| Error text (#B91C1C) | ✅ Good | Red on white typically passes |
| Dark mode (system) | ⚠ Partial | Tokens adapt; page CSS may not |
| Placeholder/muted text | ⚠ Check | May fail WCAG AA on secondary text |

**Recommendation:** Run automated contrast audit (axe, Lighthouse) on all primary pages.

---

## Keyboard Navigation

| Surface | Status | Notes |
|---------|--------|-------|
| Public Navbar | ✅ Good | Mobile menu tabindex management |
| MainLayout sidebar | ⚠ Partial | NavLinks focusable; drawer trap unclear |
| Mission Control actions | ⚠ Partial | Button grids — tab order OK |
| SlideOverPanel | ⚠ Unknown | Focus trap not verified |
| OutcomeWizard | ⚠ Partial | Form fields focusable |
| Onboarding forms | ✅ Good | Standard tab order |
| Executive focus cards | ⚠ Partial | Clickable divs — may lack keyboard |

**Issues:**
- Clickable `<div>` cards may not be keyboard accessible
- No visible skip-to-content link
- Modal focus trap (WorkflowGateModal) unverified — modal is dead code anyway

---

## ARIA Usage

**~50 ARIA attributes** found across frontend (sparse coverage).

| Component | ARIA features |
|-----------|---------------|
| Public Navbar | `aria-expanded`, `aria-controls`, `aria-label` |
| MainLayout | `aria-label` on sidebar buttons |
| SlideOverPanel | `role="dialog"`, `aria-modal`, `aria-labelledby` |
| ActivityFeed | `aria-live`, filter labels |
| Contact.jsx | Form labels, `aria-invalid` |
| JourneyProgress | `aria-current` on steps |
| ProspectCenter | Row labels |
| Executive InterviewPipeline | `aria-label` on pipeline |

**Missing ARIA:**
- Most Mission Control panels
- HomeDashboard cards
- Loading states (no `aria-busy`)
- Executive dashboard skeleton (no `aria-busy` or `role="status"`)

---

## Focus States

| Area | Status |
|------|--------|
| Onboarding inputs | ✅ `:focus` styles in CSS |
| Public buttons | ✅ Visible focus |
| MainLayout nav | ⚠ NavLink focus — depends on browser default |
| NextActions buttons | ⚠ Inconsistent |
| Inline-styled Prospect.jsx | ❌ No focus styles |

**Recommendation:** Unified `:focus-visible` ring in Design System v1.

---

## Labels & Forms

| Form | Labels | Errors announced |
|------|--------|------------------|
| Onboarding | ✅ `<label>` + OnboardingError | ⚠ Visual only |
| QuickCapture | ✅ Labels present | ⚠ Visual only |
| Contact | ✅ Good ARIA | ⚠ Visual only |
| OutcomeWizard | ⚠ Partial | No |
| ActivityFeed note | ⚠ Placeholder only | No |
| WhatsAppConnect | N/A SDK | N/A |

**No `aria-describedby`** linking errors to fields consistently.

---

## Error Handling Accessibility

| Pattern | Accessible |
|---------|------------|
| `.onboarding-error` | Visual only |
| `.executive-error` | Visual only |
| Inline red `<p>` | Visual only |
| `aria-live` regions | ActivityFeed only |

**Recommendation:** Add `role="alert"` or `aria-live="polite"` to error containers.

---

## Tables

| Table | Headers | Scope | Caption |
|-------|---------|-------|---------|
| TeamInterviewBoard | ✅ `<th>` | ⚠ No scope | ❌ No caption |
| InfoCard | ✅ | ❌ | ❌ |
| InterviewCard | ✅ | ❌ | ❌ |

**Recommendation:** Add `<caption>` (visually hidden) and `scope="col"` on headers.

---

## Charts & Visualizations

| Viz | Accessible alternative |
|-----|------------------------|
| InterviewPipeline | `aria-label` on container only — no data table fallback |
| AgencyHealth | Score text visible — OK |
| Metric panels | List text — OK |

**Recommendation:** Provide screen-reader text summary for pipeline funnel data.

---

## Screen Readers

| Concern | Status |
|---------|--------|
| Page title updates on route change | ❌ Not implemented (`document.title` static?) |
| Route announcements | ❌ No live region on navigation |
| Loading announcements | ❌ "Loading..." not in live region |
| Emoji icons | ❌ Read aloud literally ("rocket emoji") |
| Language attribute | ⚠ Check `index.html` lang attribute |
| i18n content switch | ⚠ No `lang` attribute update on ES/EN toggle |

---

## Motion & Animation

| Feature | Status |
|---------|--------|
| `prefers-reduced-motion` | ❌ Not implemented |
| Skeleton animations | Always animate |
| Sidebar transitions | Always animate |

**Recommendation:** Respect reduced motion in DS v1.

---

## Accessibility by Page

| Page | Score (est.) | Top issue |
|------|--------------|-----------|
| Public site | 65 | Good navbar patterns |
| Onboarding | 70 | Form labels good; errors not announced |
| ProspectWorkspace | 60 | Partial ARIA |
| ProspectCenter | 55 | List semantics OK |
| ExecutiveDashboard | 50 | Clickable cards, pipeline |
| Mission Control | 45 | Emoji, inline errors |
| HomeDashboard | 45 | Cards lack semantics |
| Prospect.jsx | 30 | Inline styles, no ARIA |
| PlaceholderPage | 40 | Minimal structure |

---

## WCAG 2.1 Target

**Recommend WCAG 2.1 Level AA** for Design System v1 and all redesigned pages.

### Priority fixes for DS v1

1. 🔴 Replace emoji icons with accessible SVG + `aria-hidden`
2. 🔴 Add focus-visible styles to all interactive elements
3. 🔴 Announce form errors with `aria-live`
4. 🟠 Add skip-to-content link in MainLayout
5. 🟠 Page title updates on route change
6. 🟠 Keyboard support for clickable cards (use `<button>` or `role="button"` + keydown)
7. 🟠 `prefers-reduced-motion` support
8. 🟡 Table captions and header scope
9. 🟡 Loading `aria-busy` on async pages
10. 🟡 Update `lang` attribute on language toggle

---

## Tooling Recommendations

| Tool | Purpose |
|------|---------|
| eslint-plugin-jsx-a11y | Catch issues in CI |
| axe-core / Lighthouse | Automated audits per page |
| Manual screen reader test | VoiceOver + NVDA on 5 key flows |
| Contrast checker | Verify all DS v1 tokens |

---

## Key Flows to Test Manually

1. Onboarding signup → activate (keyboard only)
2. Mission Control queue navigation (keyboard only)
3. Prospect workspace note submission (screen reader)
4. Public contact form (screen reader)
5. Language toggle ES/EN (screen reader)

**Accessibility must be built into Design System v1 primitives — not patched page by page.**
