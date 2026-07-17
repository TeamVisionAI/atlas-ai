# Atlas Business Rules

Atlas is built from real Team Vision recruiting experience.

These business rules represent how Team Vision operates in the real world.

Every future feature should follow these rules whenever possible.

If a future feature violates a business rule, the business rule takes priority.

**Implementation:** Decisions live in `backend/core/businessRulesEngine.js`. Conversation wording lives in `backend/core/conversationCopy.js`. Rule application lives in `backend/core/businessRulesApplicator.js`.

---

# Office & Coverage

## BR-018

Team Vision office location:

- **Name:** Team Vision Office
- **Address:** 2500 NW 79th Ave, Suite 189, Doral, FL 33122

---

## BR-019

Prospects within approximately **25 miles** of the Doral office are **LOCAL**.

Default interview type: **In Person**.

---

## BR-020

Prospects **outside** local coverage default to **Zoom**.

Atlas does not ask Office vs Zoom when only one type applies.

---

## BR-021

If a **LOCAL** prospect requests Zoom, allow Zoom immediately. No approval required.

---

## BR-022

If an **OUTSIDE** prospect requests an in-person interview, set `needsHumanCoordinator = true`.

Reason: Special meeting request. Do not promise another location automatically.

---

# Scheduling

## BR-001

Attempt to schedule interviews within the next 48 hours whenever possible.

---

## BR-002

If the interview is Zoom and there is interview capacity today, Atlas may offer a same-day interview.

---

## BR-003

If the prospect requests another day or time, Atlas should search for the requested availability instead of forcing the default scheduling window.

---

## BR-004

Working prospects should normally be asked:

> "Would before or after 5 PM be more convenient?"

---

## BR-005

Unemployed prospects should normally be asked:

> "Would you prefer a morning or afternoon interview?"

---

## BR-006

Maximum interview capacity per time slot is 2.

---

## BR-007

Atlas manages interview capacity, not appointments.

---

## BR-023

Default scheduling window: **9:00 AM through 8:30 PM**.

Outside that window → human coordinator review. Do not auto-schedule.

---

# Recruiter Presence

## BR-008

Recruiter Presence overrides calendar availability.

---

## BR-009

Recruiter statuses include:

- Available
- Busy
- Do Not Schedule
- Driving
- Training
- Vacation

---

## BR-010

Atlas should never schedule interviews for recruiters marked as Do Not Schedule.

---

# Conversation Style

## BR-011

Atlas should sound like a professional Team Vision recruiting coordinator.

---

## BR-012

Messages should be short, natural, and appropriate for WhatsApp.

---

## BR-013

Avoid robotic acknowledgments and filler transitions such as:

- "I appreciate the information."
- "Thank you for sharing your location."
- "Let's keep going with your interview."

Use short acknowledgments instead.

**Examples:**

- Perfecto.
- Excelente.
- Entendido.
- Gracias.

---

## BR-014

Atlas should never ask for information it already knows.

---

# Human Takeover

## BR-015

A recruiter can take over any conversation at any moment.

---

## BR-016

While in Human Mode, Atlas continues listening and updating memory but never sends messages.

---

## BR-017

When Atlas resumes, it should continue naturally without restarting the conversation.

---

## BR-024

Return `needsHumanCoordinator = true` whenever human judgment is preferred (outside coverage in-person requests, outside scheduling window, ambiguous authorization).

---

# Agent Next Actions

## BR-025

Mission Control Next Actions are computed from prospect milestone, interview type, interview timing phase, workflow state, and completed agent actions. Actions are never shown as a fixed set per screen.

## BR-026

Each valid state exposes exactly one **primary** action representing the highest-value next step for the recruiter.

## BR-027

Send Zoom Link appears only for Zoom interviews. Send Office Location appears only for Office/In Person interviews. Never both simultaneously.

## BR-028

Resource sends follow interview timing:

- **Future (>2h):** resource send is secondary
- **Soon (≤2h):** resource send is primary when not yet completed in workflow state
- **Past + confirmed + no outcome:** all Next Actions are hidden — Workflow Gate owns the UI (see BR-015)

## BR-029

Once an agent send is recorded (`zoom_link_sent`, `office_location_sent`, `missed_appointment_sent`), hide that action until workflow state changes (reschedule, interview type change, or new confirmation). No time-based expiry.

## BR-030

Call and WhatsApp remain available for all non-closed milestones unless Workflow Gate is active. Primary vs secondary priority varies by context.

## BR-031

Notes appear at every milestone except while Workflow Gate is active.

## BR-032

Closed prospects are not a single state. Action visibility depends on closure reason (for example, Not Interested with optional future reminder).

---

# Design Philosophy

Atlas does not replace recruiters.

Atlas removes repetitive work.

Atlas protects recruiter time.

Atlas optimizes interview capacity.

Atlas adapts to real life.

Atlas learns Team Vision's business rules.

People live their lives.

Atlas works around them.

---

# Engine Map

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Rules | `businessRulesEngine.js` | Decisions only — coverage, interview type, scheduling window, escalation |
| Application | `businessRulesApplicator.js` | Apply rule decisions to prospect profile |
| Conversation | `semanticConversationEngine.js` | Message flow, FAQ, handoff orchestration |
| Copy | `conversationCopy.js` | User-facing wording from rule decisions |
| Scheduling | `schedulingEngine.js` | Available times and slot logic |
| Capacity | `capacityEngine.js` | Per-slot capacity (BR-006, BR-007) |
| Agent Actions | `agentActionEngine.js` | Next Actions visibility and execution (BR-025 – BR-032) |
