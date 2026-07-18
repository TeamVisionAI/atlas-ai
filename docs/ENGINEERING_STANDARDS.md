# Atlas Engineering Standards

Cross-cutting engineering expectations for Atlas features. Feature specifications (e.g. Sprint 10.2) reference this document for performance and quality targets rather than duplicating them.

---

## API response times

| Surface | Target (P95) | Notes |
|---------|--------------|-------|
| Aggregated read endpoints (dashboard, workspace) | < 800 ms | Single compose call; no per-prospect N+1 |
| Paginated feeds (timeline, activity) | < 500 ms | Default page size ≤ 25 |
| Mutation endpoints (advance, actions) | < 1200 ms | Includes event emission |

Measure against production Supabase latency; optimize compose functions before adding caches.

---

## Frontend loading

| Pattern | Standard |
|---------|----------|
| Initial route | Skeleton for above-the-fold content |
| Lazy sections | Load on accordion expand or viewport entry |
| Mutations | Disable controls while in flight; refresh read model on success |
| Polling | Avoid in MVP features unless product requires live updates |

---

## Caching

| Layer | MVP | Future |
|-------|-----|--------|
| Workspace GET | No cache | ETag / short TTL |
| Timeline | No cache | Cursor pagination only |
| Static assets | Vite build hashes | CDN at deploy |

---

## Pagination

- Cursor-based preferred over offset for activity feeds.
- Default limits: mobile preview 10, desktop 25, max request 100.
- Return `{ items, nextCursor, hasMore }`.

---

## Verification

- Every sprint adds or extends a `backend/dev/verifySprint*.js` script.
- Golden Scenarios must remain 10/10 unless a milestone change is explicitly approved.
- Prior sprint verification scripts must pass on release branches.

---

## Security baseline

- Protected routes use `requireAtlasUser`.
- Production APIs exclude `sim-*` prospects.
- No secrets in client bundles except explicit bootstrap tokens (dev/staging only).
- Normalize phone numbers server-side before persistence and deduplication.

---

## Internationalization

Atlas UI must **never mix English and Spanish** in the same view. All user-visible chrome — navigation labels, buttons, menus, dialogs, page titles, section headers, empty states, and error messages — must come from the i18n system.

### Implementation

| Piece | Location |
|-------|----------|
| Translation catalog | `frontend/src/i18n/translations.js` |
| React context | `frontend/src/i18n/LanguageContext.jsx` — exposes `translate(key, params)` |
| Interpolation | `frontend/src/i18n/translate.js` |
| Nav config | `frontend/src/config/missionControlNav.js` — use `labelKey`, not hardcoded `label` |

### Rules

1. **No hard-coded visible strings** in components, pages, or layout. Use `translate("key")` or pass translation keys to view-model builders.
2. **Nav labels (approved):**

   | English | Spanish | Key |
   |---------|---------|-----|
   | Executive Dashboard | Panel Ejecutivo | `navExecutiveDashboard` |
   | Quick Capture | Captura Rápida | `navQuickCapture` |
   | Mission Control | Centro de Control | `navMissionControl` |
   | Pipeline | Canal de Prospección | `navPipeline` |
   | Conversations | Conversaciones | `navConversations` |

3. **Prospect `communication_language`** is independent of UI language. Language names in Quick Capture (Español / English) describe the prospect's channel language, not the app UI.
4. **Server returns canonical codes**; the client maps them to localized labels. Backend-generated copy (e.g. activity summaries) should eventually return keys or be mapped client-side — do not leave mixed-language UI.
5. **New UI copy** requires keys in both `es` and `en` blocks in `translations.js` before merge.
6. **Prospect Workspace accordions:** collapsed sections must show a meaningful one-line summary (see Sprint 10.2 spec).

### Default UI language

Spanish (`es`) is the default. Users toggle via the language control in `MainLayout`.

---

## Sprint lock policy

When a sprint is **LOCKED** (e.g. Sprint 10.1 Quick Capture):

- No behavioral changes to locked routes, APIs, or validation without a new sprint ID.
- Additive fields and backward-compatible extensions are allowed if verification proves no regression.
- Locked sprint verification scripts must pass unchanged on every subsequent release.
- **Exception:** changes only when driven by **real user feedback** or a **genuine usability issue** — still require `verifySprint10_1.js` to pass.

### Sprint 10.1 Quick Capture — LOCKED

| Item | Value |
|------|--------|
| **Tag** | `v0.1.0-alpha` — First Working Prospect Capture |
| **Route** | `/quick-capture` |
| **Post-save redirect** | `/prospect-workspace/:phone` |
| **Verification** | `node backend/dev/verifySprint10_1.js` |
| **Form fields (UI)** | First name, last name, phone, how did you meet this person?, save |
| **Inferred on save** | `communication_language` (Atlas UI language), `entry_method`, owner, preferred channel |

Do not modify Quick Capture behavior for cosmetic or speculative UX unless the exception above applies.
