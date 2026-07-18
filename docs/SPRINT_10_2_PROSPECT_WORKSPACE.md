# Sprint 10.2 — Prospect Workspace

**Status:** Sprint 10.2a complete · Sprint 10.2b (Activity Feed) complete  
**Depends on:** Sprint 10.1 (LOCKED), Sprint 8A workflow platform  
**Engineering targets:** [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md)  
**Related:** [ATLAS_CORE_ARCHITECTURE.md](./ATLAS_CORE_ARCHITECTURE.md) § Prospect Workspace

---

## 1. UX principle (architecture)

> **The Prospect Workspace is an execution workspace, not a record viewer.**

| Execution workspace | Record viewer (avoid) |
|---------------------|------------------------|
| Answers “what do I do next?” first | Static profile fields dominate |
| Journey and actions above the fold | Long contact forms and metadata |
| One chronological activity stream | Separate Notes, Timeline, and message panels |
| Read models from engines; UI presents | UI computes milestones or priority |
| Optimized for thumb-first mobile action | Desktop CRM layout ported to phone |

**Mission Control** remains the **queue-first** execution surface (`/mission-control`).  
**Prospect Workspace** is the **single-prospect** execution surface (`/prospect-workspace/:phone`).

Both are execution workspaces. Neither is a passive CRM record.

---

## 2. Five-question layout (canonical order)

Every viewport size must present sections in this order so the recruiter’s mental model stays consistent:

| # | Question | Section | Primary content |
|---|----------|---------|-----------------|
| **1** | Who is this person? | **Identity** | Name, prospect number, phone, communication language chip |
| **2** | Where are they in their journey? | **Journey Progress** | Visual stepper from `canonicalMilestone` (read-only) |
| **3** | What should I do next? | **Actions** | Primary CTA, workflow gate (if active), secondary actions |
| **4** | What has happened recently? | **Activity Feed** | Unified chronological stream (see §6) |
| **5** | What additional details might I need? | **Details** | Interview metadata, status summary, capture fields, Atlas Coach placeholder |

**Rules:**

- Sections **1–3** must be visible without scroll on mobile (above the fold).
- Section **4** is first-class content—not an accordion, not split into Notes + Timeline.
- Section **5** collapses on mobile (accordion); expanded by default on desktop side column where space allows.
- **Collapsed accordion rule:** every collapsible section must show a **meaningful one-line summary** when collapsed so leaders can scan the workspace without opening each section.
- **No standalone Notes section. No standalone Timeline section.** Notes and timeline events are activity types inside the feed.

---

## 3. Mobile layout

Single column, thumb-first; follows the five-question order.

```
┌─────────────────────────────┐
│ ← Back    Prospect Workspace│
├─────────────────────────────┤
│ ① IDENTITY                  │
│    Name · TV-000042           │
│    phone · language chip      │
├─────────────────────────────┤
│ ② JOURNEY PROGRESS          │
│    Lead → … → Orientation     │
│    (current step highlighted) │
├─────────────────────────────┤
│ ③ ACTIONS                   │
│    [Primary action card]      │
│    [Workflow gate if active]  │
│    Call · WhatsApp · …        │
├─────────────────────────────┤
│ ④ ACTIVITY FEED             │
│    [Note composer]            │
│    · message · event · note   │
│    · reminder · …             │
│    [Load more]                │
├─────────────────────────────┤
│ ⑤ DETAILS ▼                 │
│    Interview · status ·       │
│    source · owner · coach     │
└─────────────────────────────┘
```

- No queue navigator (distinct from Mission Control).
- Sticky bottom bar only when a mutation requires explicit save (reuse existing gate/wizard patterns).

---

## 4. Desktop layout

Same **five-question order**; two columns for density after section ③.

```
┌──────────────────────────────────────────────────────────────────┐
│ ① Identity strip                                                │
│ ② Journey Progress (full width)                                 │
│ ③ Primary action · secondary actions · workflow gate (if active)  │
├───────────────────────────────┬──────────────────────────────────┤
│ Main (~58%)                   │ Side (~42%)                      │
│                               │                                  │
│ ④ Activity Feed (scroll)      │ ⑤ Details                        │
│    composer + chronological   │    Interview card                │
│    stream                     │    Status summary                │
│                               │    Capture metadata              │
│                               │    Atlas Coach (placeholder)     │
└───────────────────────────────┴──────────────────────────────────┘
```

- **Route:** `/prospect-workspace/:phone` (Sprint 10.1 contract — unchanged).
- Sprint 10.2 replaces reuse of `Dashboard.jsx` on this route with dedicated `ProspectWorkspace` page composing shared workflow components.

---

## 5. Section specifications

### 5.1 Identity — “Who is this person?”

| Field | Source |
|-------|--------|
| Name | `prospects` |
| Prospect number | `prospects.prospect_number` |
| Phone | `prospects.phone` (normalized display) |
| Communication language | `prospects.communication_language` — read-only chip |

Compact horizontal strip; no editable profile form in 10.2.

### 5.2 Journey Progress — “Where are they in their journey?”

**Component:** `JourneyProgress` — placed **directly under Identity** on all viewports.

Horizontal stepper; display-only (not clickable to advance in MVP).

**MVP steps:**

```
Lead → Qualify → Interview → Outcome → Recruit → Orientation
```

**Mapping:** From `workflow.canonicalMilestone` groups (read-only):

| Step | Canonical milestones (current = highlighted) |
|------|-----------------------------------------------|
| Lead | `NEW_LEAD`, `GREETING_SENT` |
| Qualify | `QUALIFICATION`, `INTERVIEW_READY` |
| Interview | `INTERVIEW_SCHEDULED`, `INTERVIEW_DUE`, `INTERVIEW_COMPLETED`, `INTERVIEW_RESULT_PENDING` |
| Outcome | `FOLLOW_UP` |
| Recruit | `ORIENTATION`, `LICENSING`, `FAST_START` |
| Orientation | `ORIENTATION` (sub-highlight when in licensing/fast start) |

**Visual states:** `complete` · `current` · `upcoming` · `skipped` (terminal `CLOSED` / `DO_NOT_CONTACT` → badge on current step).

Advancement remains via action cards and BR-035 — not the stepper.

### 5.3 Actions — “What should I do next?”

Reuse existing Mission Control action paths — **no parallel action engine**.

| Source | UI |
|--------|-----|
| `availableActions` | Primary + secondary action cards |
| `workflowGate` | `WorkflowGatePanel` (reuse) — **replaces** standard cards when active (BR-028) |
| `POST …/workflow/advance` | Outcome wizard (reuse) |
| `POST …/actions` | Existing agent action handler |

When gate is active, hide standard action cards. Disable controls during mutations.

### 5.4 Activity Feed — “What has happened recently?”

**Replaces** standalone Notes and standalone Timeline sections from earlier proposals.

Single chronological stream for all prospect activity:

| Activity type | Source (MVP) | Feed presentation |
|---------------|--------------|-------------------|
| `message_inbound` | `conversation_logs` (inbound) | Message preview + timestamp |
| `message_outbound` | `conversation_logs` (outbound) | Message preview + timestamp |
| `workflow_event` | `workflow_events` | Localized summary from `event_type` + payload |
| `note` | Agent note action → persisted entry | Author + body + timestamp |
| `reminder` | `workflow_events` or agent state | Reminder label + due time |
| `system` | Reconciliation / ownership changes | System actor label |

**Ordering:** Newest first (default). “Oldest first” toggle is backlog.

**Add note:** Composer at top of feed. Submitting a note:

1. Calls existing agent note API / action path.
2. Appends a `note` activity entry.
3. Refreshes feed — no full page reload.

**Future types** (schema-ready): `call_logged`, `appointment`, `document_sent`, `coach_suggestion` — extend `activityType` without UI redesign.

**API:** `GET /api/prospect-workspace/:phone/activity?limit=25&cursor=...`

```json
{
  "id": "uuid-or-composite-key",
  "activityType": "note | message_inbound | workflow_event | reminder | ...",
  "timestamp": "ISO-8601",
  "actor": "AGENT | ATLAS | SYSTEM | prospect",
  "summary": "Human-readable line",
  "payload": { }
}
```

Server merges sources, sorts by `timestamp`, paginates.

### 5.5 Details — “What additional details might I need?”

Collapsible on mobile; side column on desktop. Secondary to execution — never competes with Actions for prominence.

| Block | Content | Source |
|-------|---------|--------|
| **Interview** | Datetime, type, calendar link, confirmation, outcome, gate state | prospect + workflow + gate |
| **Status** | Milestone label, workflow owner, priority tier, stall, DNC | `buildWorkflowReadModel` |
| **Capture metadata** | Source, entry method, owner, created by | prospect + `atlas_users` |
| **Atlas Coach** | Placeholder panel (no LLM in 10.2) | `atlasCoach: null` |

Interview **gate CTA** lives in §5.3 Actions when active; interview **facts** live here in Details.

---

## 6. Information hierarchy (engine priority)

| Priority | Maps to question | Content |
|----------|------------------|---------|
| P0 | Q1, Q2 | Identity, Journey Progress |
| P0 | Q3 | Primary action, workflow gate |
| P1 | Q4 | Activity Feed (recent items) |
| P2 | Q5 | Interview facts, status summary |
| P3 | Q5 | Capture metadata, communication prefs |
| P4 | Q5 | Atlas Coach placeholder |

**Rule:** UI never computes milestones, ownership, or priority — only consumes existing engines and read models.

---

## 7. Unchanged constraints (Sprint 10.1 lock)

| Area | Constraint |
|------|------------|
| Quick Capture | Routes, validation, fields, duplicate dialog — **unchanged** |
| Post-save redirect | `/prospect-workspace/:phone` — **unchanged** |
| Mission Control | `/mission-control` queue UI and APIs — **unchanged** |
| Business logic | Workflow engine, BR-* rules, action matrix — **unchanged** |
| APIs | Mission Control GET/POST paths — **unchanged**; workspace endpoints are **additive** |
| Verification | `verifySprint10_1.js` must pass without modification |

---

## 8. API endpoints (additive only)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/prospect-workspace/:phone` | Aggregated workspace payload |
| `GET` | `/api/prospect-workspace/:phone/activity` | Paginated unified activity feed |

### `GET /api/prospect-workspace/:phone`

Composes existing engines — no duplicated business logic.

```json
{
  "prospect": { },
  "owner": { "id", "display_name" },
  "workflow": { },
  "workflowGate": { },
  "availableActions": [ ],
  "agentState": { },
  "journey": { "currentStepKey", "steps": [ ] },
  "activityPreview": [ ],
  "interview": { "datetime", "type", "isPast", "outcome", "calendarEventId", "gateActive" },
  "atlasCoach": null
}
```

Implementation: wrap `getMissionControlWithActions` + journey mapper + activity preview (≤ 5 items).

`latestConversation` is **not** a separate UI section — most recent messages appear in Activity Feed; optional single-line preview in Details is backlog.

---

## 9. Reusable components

| Component | Role |
|-----------|------|
| `JourneyProgress` | **New** — Q2 stepper |
| `ActivityFeed` | **New** — Q4 unified feed + note composer |
| `ActivityFeedItem` | Row renderer by `activityType` |
| `ProspectIdentityStrip` | **New** — Q1 compact header |
| `ProspectDetailsPanel` | **New** — Q5 collapsible / side column |
| `AtlasCoachPlaceholder` | Q5 placeholder |
| `WorkflowGatePanel`, `OutcomeWizard`, action cards | **Reuse** from Mission Control |

Per [BACKLOG.md](./BACKLOG.md); shared UI primitives (`AtlasButton`, `AtlasBanner`, etc.) adopted incrementally.

---

## 10. Database, events, performance, i18n, security

Unchanged from prior revision — see prior sections in git history. Summary:

- **DB:** MVP requires no schema change; optional `prospect_activity` table is 10.2b backlog.
- **Events:** Activity feed is a read projection over existing stores; no new event types required for MVP.
- **Performance:** Workspace GET includes `activityPreview` (≤ 5); full feed paginated. See [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md).
- **i18n:** All UI chrome via `LanguageContext`; activity summaries via server type + client template.
- **Security:** `requireAtlasUser`, phone normalization, production `sim-*` exclusion, owner access policy.

---

## 11. Acceptance criteria

### Routing & Sprint 10.1 lock

- [ ] `/prospect-workspace/:phone` renders dedicated `ProspectWorkspace` (not Mission Control queue UI)
- [ ] Quick Capture success → `/prospect-workspace/:phone` (10.1 unchanged)
- [ ] `verifySprint10_1.js` passes without modification
- [ ] Mission Control at `/mission-control` unchanged

### Five-question layout

- [ ] **Q1 Identity** visible at top on mobile and desktop
- [ ] **Q2 Journey Progress** directly under Identity; above the fold on mobile
- [ ] **Q3 Actions** includes primary CTA; gate replaces cards when active (BR-028)
- [ ] **Q4 Activity Feed** is a single unified stream — **no** separate Notes or Timeline sections
- [ ] **Q5 Details** collapsible on mobile; interview + status + metadata + coach placeholder

### Activity Feed

- [ ] Messages, workflow events, notes, reminders in one chronological feed
- [ ] Add note from composer; appears without full reload
- [ ] Pagination / load more

### Data integrity

- [ ] Milestone, owner, priority match Mission Control GET for same phone
- [ ] Journey Progress highlight matches `canonicalMilestone`

### Verification

- [ ] New `verifySprint10_2.js` covers workspace GET, activity feed, auth, 10.1 regression
- [ ] Golden Scenarios 10/10

---

## 12. Delivery phases

| Phase | Scope |
|-------|--------|
| **10.2a** | Dedicated page, workspace GET, Q1 Identity, Q2 Journey Progress, Q3 Actions (reuse), Q5 Details shell |
| **10.2b** | Activity feed endpoint + Q4 `ActivityFeed` + note composer |
| **10.2c** | Reusable UI extraction; Atlas Coach placeholder; i18n pass |
| **10.2d** | Owner display, access policy, polish |

---

## Revision history

| Date | Change |
|------|--------|
| 2026-07-17 | Initial proposal |
| 2026-07-17 | Approved with revisions: unified Activity Feed, Journey Progress, Atlas Coach placeholder |
| 2026-07-17 | **Architecture revision for final approval:** execution-workspace UX principle; five-question layout order; Notes + Timeline explicitly replaced by Activity Feed; Journey Progress under Identity |
