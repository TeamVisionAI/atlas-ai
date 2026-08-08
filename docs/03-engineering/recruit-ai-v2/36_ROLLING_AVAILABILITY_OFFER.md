# BR-108 — Rolling Multi-Date Availability Offer

**Status:** Implemented — read-only bounded rolling search over Sprint 22 `getSlots`. Execution remains OFF.  
**Business rule:** BR-108  
**Depends on:** BR-079, BR-084, BR-102, BR-105, BR-107  
**Adapter:** `backend/core/recruitAiV2/schedulingAvailabilityReader.js`  
**Tests:** `backend/test/recruitAiV2RollingAvailabilityBr108.test.js`  
**Simulator:** `rolling-availability-after-constraint`

## Product change

When the prospect gives a useful time constraint (e.g. `después de las 5`) and no concrete date is resolved, Atlas **searches upcoming real availability** and offers day+time choices instead of asking:

- “¿Qué día te funciona mejor?”
- “¿Qué hora después de las 5 te funciona mejor?”

## Search bounds

| Stage | Bound | Rationale |
|---|---|---|
| Initial horizon | **48 hours** from org-local NOW | Prefer near-term useful options |
| Expansion | Day-by-day until **2** useful slots or **14 calendar days** from org-local today | Finite reads; recruiting interviews typically within two weeks |
| Source | Sprint 22 `getSlots` (`date` / `dateEnd`) | Same canonical engine as BR-107; FreeBusy only inside engine |

## Selection

1. Filter by BR-107 constraint semantics (exclusive/inclusive) on every date  
2. Drop past slots  
3. Prefer earliest slot + earliest slot on a **later date** when available  
4. Else same-day earliest + latest (BR-107)

## Rendering

Natural org-local day wording (`hoy` / `mañana sábado` / `el lunes`) while persisting concrete `dateKey` on offered slots / `previouslyOfferedSlots` (conversation context only).

## Safety

No booking, Calendar writes, WhatsApp, or BR-080 mutation. Provider failure ≠ zero availability.
