# Responsive Audit — Atlas Frontend

**Last Updated:** 2026-07-21  
**Related:** [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md)

---

## Breakpoints in Use

| Name | Range | Primary handler |
|------|-------|-----------------|
| Phone | < 768px | MainLayout `useLayoutMode`, various `@media` |
| Tablet | 768px – 1023px | MainLayout collapsible sidebar |
| Desktop | ≥ 1024px | Full sidebar, 18px base font |
| Small phone | ≤ 480px | Some page CSS (ProspectCenter, QuickCapture) |

**No ultra-wide (≥1440px) optimizations** — content stretches full width.

---

## Viewport Evaluation

### Desktop (≥ 1024px)

| Surface | Status | Notes |
|---------|--------|-------|
| MainLayout | ✅ Good | Persistent sidebar, content area |
| ExecutiveDashboard | ✅ Good | Multi-column grid |
| Mission Control | ✅ Good | Multi-panel layout |
| ProspectWorkspace | ✅ Good | Section layout |
| ProspectCenter | ✅ Good | Wide list rows |
| Public site | ✅ Good | Marketing layout |
| HomeDashboard | ✅ Good | Card grid |

### Laptop (1024px – 1280px)

| Surface | Status | Notes |
|---------|--------|-------|
| ExecutiveDashboard | ⚠ OK | Grid may feel tight |
| Mission Control | ⚠ OK | Queue + panels compete for width |
| Tables (TeamInterviewBoard) | ⚠ OK | May need horizontal scroll |

### Tablet (768px – 1023px)

| Surface | Status | Notes |
|---------|--------|-------|
| MainLayout | ✅ Good | Collapsible sidebar |
| ExecutiveDashboard | ⚠ OK | Grid stacks partially |
| Mission Control | ⚠ OK | Panels stack |
| ProspectWorkspace | ✅ Good | Accordion details |
| Prospect.jsx | ❌ Poor | Fixed inline widths |
| Public Navbar | ✅ Good | Mobile menu available |

### Mobile (< 768px)

| Surface | Status | Notes |
|---------|--------|-------|
| MainLayout | ✅ Good | Drawer sidebar |
| ProspectWorkspace | ✅ Good | Designed mobile-first sections |
| ProspectCenter | ⚠ OK | Rows stack; filters wrap |
| ExecutiveDashboard | ⚠ OK | Hero stacks; pipeline scrolls |
| Mission Control | ⚠ OK | Queue navigator usable; panels stack |
| HomeDashboard | ⚠ OK | Cards stack |
| QuickCapture | ✅ Good | Single column form |
| Onboarding | ✅ Good | Single column |
| Prospect.jsx | ❌ Broken | Inline widths, horizontal overflow |
| PlaceholderPage | ⚠ OK | Basic stack |
| Public site | ✅ Good | Mobile nav |

### Ultra-wide (≥ 1440px)

| Surface | Status | Notes |
|---------|--------|-------|
| All app pages | ⚠ Unoptimized | Content stretches; no max-width container on app shell |
| Public site | ⚠ OK | Section max-width in PublicSection.css |

---

## Broken Layouts

| Page | Viewport | Issue |
|------|----------|-------|
| Prospect.jsx | Mobile | Inline `width: 100%` cards with padding overflow |
| TeamInterviewBoard | Mobile | Table horizontal scroll (no responsive pattern) |
| InfoCard / InterviewCard tables | Mobile | No responsive collapse |

---

## Overflow Issues

| Location | Issue |
|----------|-------|
| InterviewPipeline | Horizontal step scroll on small screens (intentional) |
| Activity feed long text | Generally wraps OK |
| Mission Control action errors | Long text may overflow panel |

---

## Spacing Issues

| Location | Issue |
|----------|-------|
| Prospect.jsx | Inconsistent padding vs app shell |
| PlaceholderPage | Centered box may feel small on ultra-wide |
| Executive dashboard grid gaps | Different from HomeDashboard gaps |

---

## Navigation Issues by Viewport

| Viewport | Issue |
|----------|-------|
| Phone | 9-item drawer nav is long — scroll required |
| Tablet | Collapse button discoverability |
| All | No bottom nav alternative for thumb reach |

---

## Tables on Mobile

| Table | Responsive strategy |
|-------|---------------------|
| TeamInterviewBoard | None — scroll |
| InfoCard | None — scroll |
| InterviewCard | None — scroll |

**Recommendation:** Card-based mobile layout or horizontal scroll indicator.

---

## Charts on Mobile

| Viz | Behavior |
|-----|----------|
| InterviewPipeline | Shrinks steps; readable |
| AgencyHealth | Stacks vertically |
| Metric panels | List format — OK |

---

## Forms on Mobile

| Form | Status |
|------|--------|
| Onboarding | ✅ Full-width inputs |
| QuickCapture | ✅ Good |
| Contact (public) | ✅ Good |
| OutcomeWizard | ⚠ Select may be small |
| ActivityFeed note input | ✅ Good |
| WhatsAppConnect | ✅ SDK-driven |

---

## Responsive Score by Surface

| Surface | Score |
|---------|-------|
| Onboarding | 90 |
| Public site | 88 |
| ProspectWorkspace | 85 |
| MainLayout shell | 82 |
| ProspectCenter | 75 |
| ExecutiveDashboard | 72 |
| Mission Control | 70 |
| HomeDashboard | 70 |
| Prospect.jsx (legacy) | 35 |

**Overall responsive score: 60 / 100**

---

## Recommendations

1. **Deprecate Prospect.jsx** — worst mobile experience
2. **Add app content max-width** on ultra-wide (e.g. 1280px centered)
3. **Responsive table pattern** for TeamInterviewBoard in DS v1
4. **Reduce sidebar item count** or group on mobile
5. **Test at 320px width** — minimum supported viewport
6. **Add horizontal scroll hints** for pipeline/tables on mobile
7. **Standardize breakpoints** — document 768/1024 as canonical in DS v1

---

## Testing Checklist (for Design System v1)

- [ ] iPhone SE (375px)
- [ ] iPhone 13 (390px)
- [ ] iPad (768px)
- [ ] iPad Pro (1024px)
- [ ] Laptop (1280px)
- [ ] Desktop (1440px)
- [ ] Ultra-wide (1920px)
