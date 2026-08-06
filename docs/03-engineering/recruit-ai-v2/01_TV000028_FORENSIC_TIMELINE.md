# Phase 1–2 & 5 — TV-000028 Forensic Timeline

## Phase 1 — Target conversation identity

Verified from production records (not assumed from display name alone).

| Field | Value |
|---|---|
| Organization | Team Vision `00000000-0000-4000-8000-000000000001` |
| Prospect ID | `29853100-f151-4ca8-b07d-624fd20c6685` |
| Display name | Juanito Garcia |
| Phone | masked `+***7338` |
| Preferred language | English (`preferred_language` / log `language=en`) |
| Assigned agent / RVP | Niovel Perez / Rep ID `4TJLK` / `33ad243a-9d00-4a4d-810b-df2762c0f076` |
| Interview type | In Person / office |
| Conversation range (ET) | 2026-08-05 20:06 – 21:36 America/New_York |
| Conversation range (UTC) | 2026-08-06 00:06 – 01:36 UTC |
| Related appointment | `2be8f18b-06be-4b2b-b8e0-c4b86d8c384f` |
| Google Calendar | synced (event id present; repaired later in hotfix) |

### Why this conversation

It is the only Team Vision production thread in this window that exercises:

- scheduling menu turns
- counteroffers (`I prefer at 6`, `What about 6:30 pm?`, `6?`, `What about 6?`)
- unavailable-slot re-offers of 5:00 / 5:15
- autonomous agent persistence failure
- duplicate English office + Spanish Zoom confirmations
- post-confirm counteroffer handling

No other concurrent prospect matched the flexibility sequence.

### Workflow / appointment state

| Moment | Workflow / CE step | Appointment |
|---|---|---|
| Before conversation | none (prospect created at first inbound) | none |
| After greeting / agent advance | QUALIFICATION → schedule path | none |
| After “Ok” + name (first pass) | NAME → EMAIL; CE returned internal error | none |
| After second schedule pass + agent schedule | INTERVIEW_READY → INTERVIEW_SCHEDULED | created `scheduled` 5:15 PM ET Fri Aug 7 (later repaired to correct UTC storage) |
| After conversation end | prospect `current_step=CONFIRMED` | `scheduled`, `confirmation_status=confirmed`, office / in_person |

### Session / correlation identifiers

- Inbound provider message IDs: `wamid.*` on each `MessageReceived` (`workflow_events.correlation_id`)
- Outbound provider message IDs: `wamid.*` on each delivered freeform
- Reminder/confirmation idempotency: `reminder:2be8f18b-…:confirmation`
- Conversation log IDs: 32 rows on this phone (all `organization_id` **null** at write time — linkage gap)
- Business events for this prospect UUID in-window: **0** (recruiting BE path did not project for this case)

---

## Phase 2 — Canonical chronological timeline

Timezone for display: **America/New_York**. Sources: `conversation_logs` (content), `workflow_events` (audit), `whatsapp_outbound_deliveries` (delivery), `atlas_appointments` (appointment truth).

Legend grades use Phase 5 scale: correct / acceptable / weak / incorrect / dangerous.

### T00 — 20:06:19 ET — Prospect created

- **Source:** `workflow_events` `ProspectCreated` / `ConversationStarted`
- **Actor:** SYSTEM
- **Outcome:** NEW_LEAD; prospect row created with org (later ownership RVP)

### T01 — 20:06:23 → 20:06:30 ET — Opener

| Leg | Detail |
|---|---|
| Inbound | “Hey, whats the opportunity about??” |
| Interpretation | Treated as NEW → GREETING (location ask), **not** opportunity FAQ |
| Outbound | “Hi! What city and state do you live in?” |
| Delivery | `sent_freeform` / WINDOW_OPEN |
| Grade | **weak** — ignores question; skips intro value |

### T02 — 20:27:26 → 20:27:33 ET — Echo loop

| Leg | Detail |
|---|---|
| Inbound | Prospect pasted Atlas’s own question: “Hi! What city and state do you live in?” |
| Outbound | Same city/state question again |
| Grade | **incorrect** — no echo/duplicate-question detection |

### T03 — 20:31:17 ET — Human advancement (agent)

- Agent completed required info (city/state/work auth/occupation/interview type)
- Workflow: GREETING_SENT → QUALIFICATION; ownership AGENT then resumed
- Notes logged as `[Agent note]` / `[Required Information Updated]`
- Grade: **correct** (human path)

### T04 — 20:32:29 → 20:32:34 ET — Location + day menu

| Inbound | “Miami fl” |
| Outbound | Tomorrow / Monday menu |
| Grade | **acceptable** (menu UX) but opportunity still unexplained |

### T05 — 20:32:53 → 20:33:15 ET — Day + period

- Inbound “2” → Monday; then before/after 5:00 menu; inbound “After”
- Outbound: 5:00 / 5:15 choices
- Grade: **acceptable** as scripted scheduling

### T06 — 20:33:23 → 20:33:51 ET — First counteroffer ignored

| Inbound | “2” (5:15) → soft confirm “We have availability Monday at 5:15…” |
| Inbound | “I prefer at 6” |
| Context available | Day=Monday, period=after 5, last offered 5:00/5:15, type=in person (from agent) |
| Decision | Re-ask Monday 5:15 confirmation — **no acknowledgment of 6** |
| Outbound | “We have availability Monday at 5:15 PM. Does that work for you?” |
| Grade | **incorrect** — fails counteroffer; loses preference |

### T07 — 20:34:05 → 20:34:29 ET — Name then internal error to prospect

| Inbound | “Ok” → “What is your full name?” |
| Inbound | “Juanito Garcia” |
| Decision | Attempt appointment persistence |
| Outbound | **“Missing authenticated agent id for appointment persistence.”** |
| Delivery | Successfully sent as freeform WhatsApp |
| Grade | **dangerous** — internal diagnostic leaked to customer; booking failed |

Root cause (code): autonomous path required authenticated agent id; hotfix later added `autonomousScheduleAgentResolver` (PR #15). This timeline captures the pre-fix production failure.

### T08 — 21:02:34 → 21:02:57 ET — Flexibility turn ignored again

| Inbound | “What about 6:30 pm?” then “6?” |
| Outbound (×2) | Re-offer **5:00 PM and 5:15 PM** menus |
| Context lost | Prior Monday preference, prior “prefer 6”, already-offered slots |
| Grade | **incorrect** — parser/state did not consume counteroffer into alternatives or escalation |

Note: PR #18 later added production-only flexible parse for `"6?"` / `"What about 6:30?"`. This forensic case is the **pre-flexibility and/or post-parse-without-availability-memory** failure mode: even when times parse, Atlas re-offered the same unavailable inventory.

### T09 — 21:03:04 → 21:03:18 ET — Accept 5:15 tomorrow

- Inbound “2” then “Ok”
- Outbound soft confirm “Tomorrow at 5:15”
- Grade: **acceptable** as confirmation ask (day shifted vs earlier Monday — another context drift)

### T10 — 21:03:22 → 21:03:55 ET — Book + dual confirmations

| Event | Detail |
|---|---|
| Appointment created | `2be8f18b-…` via Mission Control / agent path (`source=mission_control`) at 21:03:22 ET |
| Agent action log | “[Agent action] Interview scheduled…” |
| Outbound A | English office confirmation 5:15 PM (CE) — delivery OK |
| Outbound B | Spanish Zoom confirmation 1:15 p.m. (reminder engine `APPOINTMENT_REMINDER` / idempotency `…:confirmation`) — delivery OK |
| Grade | **dangerous** — conflicting channel/time/language; false Zoom; wrong clock presentation |

Root causes (later hotfixed in PR #17): immediate confirmation from reminder engine + CE confirmation; Spanish Zoom template vs English office truth; UTC-as-local storage.

### T11 — 21:36:40 → 21:36:47 ET — Post-confirm counteroffer

| Inbound | “What about 6?” |
| Outbound | “✅ Your interview is already confirmed…” |
| Grade | **weak** — blocks change without offering reschedule path or acknowledging 6:00 |

---

## Phase 5 — Response scorecard (every CE / system WhatsApp reply)

| # | Outbound (abbrev.) | Understanding | Context | Natural | Pro | Brief | Clear | Lang | Sched acc. | Memory | Counteroffer | Next step | Outcome | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | City/state ask | weak | weak | weak | weak | ok | ok | ok | n/a | n/a | n/a | weak | weak | **weak** |
| 2 | City/state repeat | incorrect | incorrect | weak | weak | ok | ok | ok | n/a | incorrect | n/a | incorrect | incorrect | **incorrect** |
| 3 | Day menu | ok | ok | acceptable | acceptable | ok | ok | ok | ok | ok | n/a | ok | ok | **acceptable** |
| 4 | Before/after 5 | ok | ok | acceptable | acceptable | ok | ok | ok | ok | ok | n/a | ok | ok | **acceptable** |
| 5 | 5:00/5:15 menu | ok | ok | acceptable | acceptable | ok | ok | ok | ok | ok | n/a | ok | ok | **acceptable** |
| 6 | Re-ask 5:15 after “prefer 6” | incorrect | incorrect | weak | weak | ok | weak | ok | incorrect | incorrect | incorrect | incorrect | incorrect | **incorrect** |
| 7 | Ask name | ok | ok | ok | ok | ok | ok | ok | n/a | ok | n/a | ok | ok | **acceptable** |
| 8 | Missing agent id | incorrect | incorrect | incorrect | incorrect | ok | incorrect | ok | incorrect | n/a | n/a | incorrect | dangerous | **dangerous** |
| 9 | Re-offer 5:00/5:15 after 6:30 | incorrect | incorrect | weak | weak | ok | weak | ok | incorrect | incorrect | incorrect | incorrect | incorrect | **incorrect** |
| 10 | Same after “6?” | incorrect | incorrect | weak | weak | ok | weak | ok | incorrect | incorrect | incorrect | incorrect | incorrect | **incorrect** |
| 11 | Tomorrow 5:15 confirm ask | weak | weak | ok | ok | ok | ok | ok | weak | weak | n/a | ok | weak | **weak** |
| 12 | English office confirm | ok | ok | ok | ok | ok | ok | ok | ok* | ok | n/a | ok | ok* | **acceptable*** |
| 13 | Spanish Zoom confirm | incorrect | incorrect | incorrect | incorrect | ok | incorrect | incorrect | incorrect | incorrect | n/a | incorrect | dangerous | **dangerous** |
| 14 | Already confirmed | weak | weak | weak | acceptable | ok | ok | ok | n/a | weak | incorrect | weak | weak | **weak** |

\*English confirmation content matched office intent after later repair; at send time storage/clock bugs still existed.

### Failure patterns (exact)

| Pattern | Example | Root cause class |
|---|---|---|
| Wrong question / ignored opener | Opportunity ask → city ask | No intent routing for FAQ vs qualification |
| Repeat question | Echoed Atlas text → same ask | No inbound=prior-outbound echo guard |
| Ignore counteroffer | “I prefer at 6” → 5:15 again | Schedule state in notes/menus; no durable offered-slot memory; counteroffer not driving availability search |
| Same unavailable slots | “6:30?” / “6?” → 5:00/5:15 | Inventory fixed to capacity window; no “requested unavailable → nearest / escalate” decision |
| Day drift | Monday path → Tomorrow confirm | Soft confirm rebuilt from capacity without sticky selected day |
| Internal error to user | Missing agent id | Failure reply not sanitized; autonomous agent unresolved |
| Dual confirmation | EN office + ES Zoom | Two writers (CE + reminder confirmation) |
| Language drift | Preferred EN → ES Zoom text | Reminder copy ignored preferred language |
| Post-book rigidity | “What about 6?” → locked | CONFIRMED short-circuit without reschedule tool |

---

## Cross-source integrity notes

1. **`conversation_logs.organization_id` null** for all 32 rows — tenant field unused by `logService` (org exists on prospect).
2. **`atlas_business_events` empty** for this prospect in-window — Communications Center cannot rely on BE alone.
3. **Delivery truth** present in `whatsapp_outbound_deliveries` for CE replies + the conflicting reminder confirmation.
4. **Appointment history** shows Mission Control create; metadata records later repair (`duplicate_confirmation_hotfix_tv000028`).
