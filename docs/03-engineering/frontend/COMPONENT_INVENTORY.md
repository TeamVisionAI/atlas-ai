# Component Inventory — Atlas Frontend

**Last Updated:** 2026-07-21  
**Related:** [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md)

**Total components:** 58 across 5 folders + root

---

## Rating Legend

| Quality | Meaning |
|---------|---------|
| **High** | Production-ready, consistent patterns |
| **Medium** | Functional, needs DS v1 alignment |
| **Low** | Stub, legacy, or inline-styled |
| **Dead** | Not imported anywhere |

| Action | Meaning |
|--------|---------|
| **Reuse** | Keep with minor DS updates |
| **Redesign** | Rebuild with Design System v1 |
| **Replace** | Superseded by another component |
| **Remove** | Delete |

---

## Root Components (`components/`)

| Component | Purpose | Quality | Action | Duplicate of |
|-----------|---------|---------|--------|--------------|
| ActionCard.jsx | Unknown | Dead | **Remove** | — (empty file) |
| AgentHeader.jsx | MC greeting | Medium | Redesign | — |
| AgentMetricPanel.jsx | Metric slide-over | Medium | Redesign | Uses mock metricsEngine |
| AgentQueueNavigator.jsx | Queue nav | High | Reuse | — |
| AIRecommendationCard.jsx | Static stub | Low | Remove | RecommendationCards (executive) |
| AiBrief.tsx | Expandable AI brief | High | Reuse | — |
| AppointmentCard.jsx | Appointment display | Dead | Remove | — |
| AtlasRecommendation.tsx | Typed recommendation | Dead | Remove | RecommendationCards |
| ConversationCard.jsx | Conversation summary | Low | Replace | ProspectWorkspace |
| ConversationPanel.jsx | Live conversation | Medium | Redesign | — |
| CurrentProspectCard.jsx | Current prospect | Medium | Reuse | — |
| Header.jsx | Old header | Dead | Remove | MainLayout |
| InfoCard.jsx | Info table card | Low | Replace | ProspectDetailsPanel |
| InterviewCard.jsx | Interview table | Low | Replace | ProspectDetailsPanel |
| JourneyPackage.tsx | Package send UI | Medium | Reuse | — |
| NextActions.tsx | Action button grid | High | Reuse | — |
| NotesCard.jsx | Static stub | Low | Remove | ActivityFeed notes |
| OutcomeWizard.jsx | Outcome form | High | Reuse | — |
| PipelineCard.jsx | Pipeline stage | Low | Replace | JourneyProgress |
| QuickActions.tsx | Re-export | Dead | Remove | NextActions |
| ScrollToTop.jsx | Route scroll reset | High | Reuse | — |
| Sidebar.jsx | Old sidebar | Dead | Remove | MainLayout |
| SlideOverPanel.jsx | Generic slide-over | High | Reuse | — |
| StatCard.jsx | KPI card | Dead | Remove | FocusCards / executive |
| WorkflowCompleteBanner.jsx | Success banner | High | Reuse | — |
| WorkflowGateModal.jsx | Modal gate | Dead | Remove | WorkflowGatePanel |
| WorkflowGatePanel.jsx | Inline workflow gate | High | Reuse | — |
| ProspectCard.jsx | Hardcoded stub | Dead | Remove | — |

---

## Executive Components (`components/executive/`)

| Component | Purpose | Quality | Action |
|-----------|---------|---------|--------|
| ActivityTimeline.jsx | Recent activity list | High | Reuse → wire backend |
| AgencyHealth.jsx | Health score display | High | Reuse |
| FocusCards.jsx | Focus area cards | High | Reuse |
| InterviewPipeline.jsx | CSS funnel viz | Medium | Redesign (consider chart lib) |
| InterviewsHero.jsx | Today KPI hero | High | Reuse |
| MorningBrief.jsx | Morning brief block | High | Reuse → wire Daily Brief 1.3 |
| RecommendationCards.jsx | Recommendation list | High | Reuse |
| TeamInterviewBoard.jsx | HTML table stats | Medium | Redesign → shared Table |

---

## Onboarding Components (`components/onboarding/`)

| Component | Purpose | Quality | Action |
|-----------|---------|---------|--------|
| OnboardingGuard.jsx | Route guards (App/Onboarding outlets) | High | Reuse |
| OnboardingLayout.jsx | Shell + form primitives | High | Reuse → DS v1 inputs |
| Onboarding.css | Styles | Medium | Redesign with tokens |

**OnboardingLayout exports:** `OnboardingInput`, `OnboardingError`, `OnboardingButton`, `OnboardingCard`

---

## Prospect Workspace (`components/prospect-workspace/`)

| Component | Purpose | Quality | Action |
|-----------|---------|---------|--------|
| ActivityFeed.jsx | Feed + notes + filters | High | Reuse |
| JourneyProgress.jsx | Step progress | High | Reuse |
| ProspectDetailsPanel.jsx | Accordion details | High | Reuse |
| ProspectIdentityStrip.jsx | Identity header | High | Reuse |
| WorkspaceSection.jsx | Section wrapper | High | Reuse |

---

## Public Components (`components/public/`)

| Component | Purpose | Quality | Action |
|-----------|---------|---------|--------|
| About.jsx | About section | High | Reuse |
| Careers.jsx | Careers section | High | Reuse |
| Contact.jsx | Contact form | High | Reuse |
| Footer.jsx | Site footer | High | Reuse |
| Hero.jsx | Hero section | High | Reuse |
| Navbar.jsx | Public nav | High | Reuse |
| PrimaryButton.jsx | CTA button | High | Reuse → DS v1 Button |
| Services.jsx | Services section | High | Reuse |

---

## Missing Shared Components (to build in DS v1)

| Component | Needed by |
|-----------|-----------|
| Button (variants) | All app pages |
| Input / Select / Textarea | Forms, onboarding |
| Card | Dashboards, lists |
| Table | TeamInterviewBoard, ProspectCenter |
| Dialog / Modal | Confirmations |
| Toast / Alert | Errors, success |
| Skeleton | Loading states |
| Badge / Status | Pipeline, health |
| EmptyState | Lists, feeds |
| Icon | Replace emoji throughout |
| Chart wrappers | Pipeline, analytics |
| Timeline | Activity feeds, Mission Control |
| Sidebar / NavItem | MainLayout extraction |
| Breadcrumb | Deep navigation |
| Tabs | Settings, workspace |

---

## Engines (View Models — not UI but component dependencies)

| Engine | Role | Reusable |
|--------|------|----------|
| activityFeedViewModel.js | Activity feed logic | Yes |
| contextEngine.js | MC context, brief lines | Partial (mock data) |
| executiveDashboardViewModel.js | Executive VM | Yes → wire Daily Brief |
| executiveFilterEngine.js | Filter → deep links | Yes |
| journeyEngine.js | Package delivery | Yes |
| metricsEngine.js | Mock metric panels | Replace with API |
| prospectCenterViewModel.js | List labels/filters | Yes |
| prospectWorkspaceViewModel.js | Workspace summaries | Yes |
| queueEngine.js | Priority queue | Partial (mock placeholders) |
| workflowEngine.js | Gate state (localStorage) | Yes |

---

## Adapters

| Adapter | Role | Reusable |
|---------|------|----------|
| missionControlAdapter.js | MC data normalization | Yes |
| prospectWorkspaceAdapter.js | Workspace normalization | Yes |
| conversationPreview.js | Preview text | Yes |

---

## Summary

| Action | Count | % |
|--------|-------|---|
| Reuse | 32 | 55% |
| Redesign | 12 | 21% |
| Replace | 6 | 10% |
| Remove | 8 | 14% |

**Duplicate clusters:**
- Recommendation UI: `AIRecommendationCard`, `AtlasRecommendation`, `RecommendationCards`
- Workflow gate: `WorkflowGateModal` vs `WorkflowGatePanel`
- Navigation: `Sidebar` vs `MainLayout`
- Prospect detail: `Prospect.jsx` cards vs `ProspectWorkspace` components
- Actions: `QuickActions` vs `NextActions`
