# Sprint 10.3 — Prospect Center

**Status:** Complete  
**Depends on:** Sprint 10.2 (Prospect Workspace + Activity Feed), Sprint 9.0 (Executive Dashboard)  
**Route:** `/prospect-center` (nav replaces `/pipeline`; legacy `/pipeline` redirects)

---

## 1. Purpose

Prospect Center is the **operational browse layer** between strategic overview and single-prospect execution:

```
Executive Dashboard  →  strategic KPIs and focus counts
Prospect Center      →  browse, search, filter all prospects
Mission Control      →  prioritized queue execution
Prospect Workspace   →  single-prospect execution workspace
```

Priorities: **speed, clarity, daily usability** — not feature count.

---

## 2. Architecture

| Layer | Module |
|-------|--------|
| Read model | `backend/core/prospectCenterReadModel.js` |
| Filter resolver | `backend/core/executiveFilterResolver.js` |
| Priority source | `backend/core/missionControlPriorityEngine.js` |
| Thin API | `GET /api/prospect-center?filter=&q=` |
| View model | `frontend/src/engines/prospectCenterViewModel.js` |
| UI | `frontend/src/pages/ProspectCenter.jsx` |

Business rules stay in existing workflow engines. Prospect Center **composes** priority queue + prospect rows into DTOs.

---

## 3. API

`GET /api/prospect-center?filter=high-priority&q=maria`

```json
{
  "generatedAt": "ISO-8601",
  "totalCount": 42,
  "filteredCount": 5,
  "activeFilter": "high-priority",
  "search": "maria",
  "filters": [{ "id": "all", "count": 42 }, { "id": "high-priority", "count": 5 }],
  "items": [{
    "phone": "…",
    "name": "…",
    "prospectNumber": "TV-000042",
    "canonicalMilestone": "INTERVIEW_DUE",
    "missionControlPriority": 1,
    "missionControlPriorityTier": "PENDING_INTERVIEW_RESULTS",
    "interviewAt": "ISO-8601",
    "stalledAt": null,
    "lastMessagePreview": "…"
  }]
}
```

### Filters (reuse executive presets)

`all`, `interviews-today`, `tomorrows-interviews`, `pending-outcomes`, `high-priority`, `orientation-ready`, `stalled`

Search matches name, phone, prospect number, city, state, last message preview (read-model filter only).

---

## 4. UI scope

- Priority-sorted prospect list (backend order)
- Filter chips with counts
- Debounced search (URL `?q=`)
- Row: name, number, milestone, priority, interview, stall indicator, message preview
- **Open workspace** (primary) → `/prospect-workspace/:phone`
- **Open in queue** (secondary) → `/mission-control?phone=&filter=`
- Empty, loading, error states
- Mobile: stacked actions; desktop: compact list

### Out of scope

- Bulk actions, inline editing, analytics dashboards
- New event types or storage tables
- AI recommendations (future: derived from event stream)

---

## 5. Navigation bridges

| From | To |
|------|-----|
| Nav | `/prospect-center` |
| Executive focus cards | `/prospect-center?filter=` |
| Executive recommendations | `/prospect-workspace/:phone` |
| Mission Control header | `/prospect-center` |
| Metric panel “Open workspace” | `/prospect-workspace/:phone` |
| Prospect Workspace toolbar | Prospect Center + Mission Control |

---

## 6. Verification

```bash
node backend/dev/verifySprint10_3.js
cd frontend && npm run build
```

Includes Sprint 10.2 regression.

---

## 7. Next focus

After Sprint 10.3, development shifts to the **live recruiting engine**: real WhatsApp conversations and automated scheduling.
