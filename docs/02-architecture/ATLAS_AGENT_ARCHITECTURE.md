# Atlas Agent — Architecture & Design Specification

**Journey:** #4 — Atlas Agent  
**Status:** DESIGN ONLY (no implementation)  
**Version:** 1.0  
**Last Updated:** 2026-07-21  
**Audience:** Engineering, Product, Architecture  

**Related:** [ATLAS_CORE_ARCHITECTURE.md](./ATLAS_CORE_ARCHITECTURE.md), [WORKFLOW_ENGINE_SPEC.md](./WORKFLOW_ENGINE_SPEC.md), [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md), [atlas-communication-platform.md](./atlas-communication-platform.md), [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md)

---

## Document purpose

This document defines the **permanent architecture** of the Atlas Agent — the AI Employee layer of Atlas — before any implementation begins.

Atlas is not a chatbot. Atlas is an AI Employee whose job is to complete business workflows through natural conversation. The workflow changes by industry; the Agent does not.

This specification contains **architecture only**. It contains no production code, no UI designs, no API definitions, no integration implementations, no data schemas, and no LLM prompts.

An engineer should be able to implement the Atlas Agent from this document without guessing responsibilities or boundaries.

---

# 1. System Overview

## 1.1 Purpose

The Atlas Agent is the **decision and execution brain** that turns inbound messages into business outcomes.

Its purpose is not conversation for its own sake. Its purpose is to **advance every prospect toward a defined business outcome** with the minimum friction, the minimum repetition, and the maximum automation.

Examples of outcomes (workflow-dependent):

- Schedule Interview
- Schedule Consultation
- Schedule Mortgage Appointment
- Schedule Insurance Review
- Schedule Product Demo

The Agent selects the correct workflow, collects required information, invokes backend services, generates appropriate responses, and escalates to humans only when necessary.

## 1.2 Responsibilities

The Atlas Agent **owns**:

| Responsibility | Description |
|----------------|-------------|
| **Intent interpretation** | Understand what the prospect is trying to do in the current workflow context |
| **Objective tracking** | Know the current workflow objective and what remains incomplete |
| **Decision-making** | Determine the next best action: answer, ask, invoke a tool, wait, or escalate |
| **Memory orchestration** | Load, update, and persist conversation context across messages and sessions |
| **Response planning** | Produce natural, goal-oriented replies grounded in known facts |
| **Tool invocation** | Request work from domain services; never perform side effects directly |
| **Safety enforcement** | Apply business rules, policy gates, and confidence thresholds before acting |
| **Escalation judgment** | Transfer ownership to a human when automation is unsafe or insufficient |

The Atlas Agent **does not own**:

| Excluded | Owner |
|----------|-------|
| Channel transport (send/receive on WhatsApp, Messenger, etc.) | Communication Gateway |
| Workflow business definitions (recruiting steps, required fields) | Workflow Registry |
| Appointment creation, confirmation, calendar, Zoom | Appointments / Meetings domains |
| Persistent business records (prospects, orgs, capacity) | Domain services and repositories |
| Dashboard and operator UI | Frontend / read models |
| Notification delivery | Future delivery journey |
| Final human judgment on sensitive exceptions | Human operator |

## 1.3 Boundaries

The Agent sits **inside Atlas Core**, between the Communication Gateway and domain services.

```
Customer (any channel)
        ↕
Communication Gateway        ← transport only; channel-agnostic
        ↕
Atlas Agent                  ← this document
        ↕
Workflow Engine + Domain Services   ← business execution
        ↕
Event Bus + Read Models      ← observability and dashboards
```

**Hard boundary rules:**

1. The Agent never calls external APIs directly (calendar, Zoom, Meta, email providers).
2. The Agent never embeds workflow-specific logic (recruiting rules live in workflows, not in the Agent).
3. The Agent never mutates business state without going through a declared Tool or Workflow action.
4. The Agent never generates a customer-facing commitment that violates an active Business Rule.
5. The Communication Gateway never decides business outcomes; it normalizes messages and delivers responses.

## 1.4 Dependencies

The Atlas Agent depends on:

| Dependency | Why |
|------------|-----|
| **Communication Gateway** | Normalized inbound messages; outbound delivery |
| **Prospect Center** | Stable prospect identity across channels |
| **Organization context** | Meeting preferences, coverage rules, connected integrations |
| **Workflow Engine** | Active workflow, state, required data, completion rules |
| **Business Rules Engine** | Authoritative policy (BR-001 through BR-024+) |
| **Domain services** | Appointments, meetings, calendar, reminders, future CRM |
| **Memory store** | Conversation history, collected facts, summaries |
| **Event Bus** | Auditable timeline of decisions and outcomes |
| **Operator / Mission Control** | Human handoff target and context delivery |

The Agent must remain usable when optional integrations are unavailable (e.g., calendar not connected). It degrades gracefully and surfaces attention items rather than failing silently.

## 1.5 Design philosophy

The Atlas Agent follows the Atlas Constitution:

| Principle | Architectural expression |
|-----------|---------------------------|
| **Simple wins** | One pipeline, one decision point, one memory model. Avoid parallel conversation engines. |
| **Hide complexity** | Prospects and agents see natural language. Workflows, tools, and rules stay internal. |
| **Easy to duplicate** | New verticals add a workflow package, not a fork of the Agent. |
| **AI First** | The Agent plans and phrases; deterministic engines validate and execute. |
| **Automation First** | Default path is Atlas completes the step. Human is exception, not default. |
| **Human when necessary** | Escalation is a first-class outcome with preserved context. |

**Core product principle:** Atlas is not trying to imitate a human. Atlas is trying to become the best employee an organization has — reliable, prepared, policy-aware, and always moving toward the outcome.

## 1.6 How the Agent fits inside Atlas

Atlas today (Journeys 1–3) already demonstrates the pattern the Agent will unify:

- **Journey 1:** Organization onboarding and configuration
- **Journey 2:** Conversation → workflow → appointment → confirmation
- **Journey 3:** Appointment → meeting preparation (calendar, Zoom, reminders)

The Atlas Agent is the **permanent orchestration layer** that replaces ad-hoc conversation logic scattered across legacy engines. It consumes the Workflow Engine introduced in Sprint 13 and the event-driven domains built in Journeys 2–3.

Long term, every channel, every workflow marketplace package, and every operator surface reads from the same Agent-driven conversation state.

---

# 2. Conversation Pipeline

## 2.1 Pipeline overview

Every inbound message traverses a **single canonical pipeline**. Stages are sequential in intent but may short-circuit when no action is required (e.g., duplicate message, closed prospect).

```
Incoming Message
        ↓
Communication Gateway
        ↓
Conversation Engine
        ↓
Context Builder
        ↓
Memory Loader
        ↓
Decision Engine
        ↓
Workflow Engine
        ↓
Tool Executor
        ↓
Response Generator
        ↓
Communication Gateway
        ↓
Customer
```

Parallel observability path: each stage emits structured events to the Event Bus for timeline, Mission Control, and Executive Dashboard consumers. The Agent does not write to dashboards directly.

## 2.2 Stage responsibilities

### Communication Gateway (ingress)

**Single responsibility:** Normalize transport.

- Accept webhooks and channel-specific payloads
- Resolve or create prospect identity
- Attach channel metadata (message id, timestamp, media type)
- Route normalized message to Conversation Engine
- On egress: deliver outbound text/media via the correct connector
- Enforce channel policy (opt-in, template requirements) before send

**Does not:** interpret intent, choose workflow steps, or call calendar APIs.

### Conversation Engine

**Single responsibility:** Session continuity.

- Locate or create the active Conversation for this prospect + organization
- Enforce ownership mode (Atlas, Agent, Waiting Event, Closed)
- Reject or queue messages when ownership forbids automated reply
- Append inbound message to conversation transcript
- Pass control to Context Builder

**Does not:** decide what to say or invoke business tools.

### Context Builder

**Single responsibility:** Assemble the working snapshot for this turn.

- Load organization settings (meeting locations, coverage, integrations)
- Load active workflow registration and current workflow state
- Load prospect profile and channel linkage
- Compute derived flags (local vs remote, missing fields, stalled duration)
- Produce a **Turn Context** object consumed by Memory Loader and Decision Engine

**Does not:** mutate memory or execute tools.

### Memory Loader

**Single responsibility:** Hydrate Agent memory for this turn.

- Load short-term transcript window (recent messages)
- Load structured **Collected Facts** from workflow context
- Load conversation summary (rolling compression of older history)
- Load pending and completed tasks for this conversation
- Load sentiment and confidence trends if available
- Attach relevant Business Rule constraints to the Turn Context

**Does not:** generate responses or advance workflow state.

### Decision Engine

**Single responsibility:** Choose the next action.

See Section 3 for full specification. Output is a **Decision Record**: action type, rationale category, confidence, and parameters for downstream stages.

**Does not:** send messages, call external APIs, or contain workflow-specific branching tables.

### Workflow Engine

**Single responsibility:** Apply workflow rules to the Decision Record.

- Validate whether the proposed action is allowed in the current workflow state
- Advance state when completion rules are satisfied
- Emit workflow events (data collected, validation failed, interview requested, etc.)
- Return structured workflow result to Tool Executor and Response Generator

**Does not:** phrase customer messages or call Google Calendar.

### Tool Executor

**Single responsibility:** Invoke domain services requested by the Decision + Workflow result.

Examples: create appointment, confirm appointment, prepare meeting, lookup capacity, future CRM write.

- Tools are idempotent where possible
- Tools return success/failure + structured payload
- Failures feed back to Decision Engine on retry turns (bounded)

**Does not:** decide whether a tool should run; that is Decision Engine + Workflow Engine.

### Response Generator

**Single responsibility:** Produce the customer-facing message.

- Transform Decision Record + workflow result + memory into natural language
- Apply response strategy rules (Section 7)
- Apply safety filters (Section 8)
- Never include facts not grounded in memory or tool results

**Does not:** choose business actions or bypass workflow validation.

### Communication Gateway (egress)

**Single responsibility:** Deliver the generated response on the inbound channel.

---

## 2.3 Pipeline invariants

1. **One inbound message → at most one primary outbound reply** unless workflow explicitly requires a sequence (confirmation + follow-up is event-driven, not double-reply in one turn).
2. **Workflow state changes only through Workflow Engine**, never through Response Generator.
3. **Side effects only through Tool Executor**, never through Decision Engine or Response Generator.
4. **Every turn produces an auditable Decision Record**, even when the action is "no reply" or "escalate."

---

# 3. Decision Engine

## 3.1 Purpose

The Decision Engine is the **strategic layer** of the Atlas Agent. It answers: *Given everything we know, what should happen next?*

It separates **deciding** from **doing**. Doing belongs to Workflow Engine and Tool Executor.

## 3.2 Inputs

| Input | Source |
|-------|--------|
| Turn Context | Context Builder |
| Hydrated memory | Memory Loader |
| Active workflow descriptor | Workflow Registry |
| Business rule constraints | Business Rules Engine |
| Ownership mode | Conversation Engine |
| Last tool results | Previous turn cache |
| Channel capabilities | Communication Gateway |

## 3.3 Outputs — Decision Record

Every turn produces a Decision Record containing:

| Field | Purpose |
|-------|---------|
| **Action type** | One of: Answer, Ask, Collect, Confirm, Invoke Tool, Wait, Escalate, Close, No-op |
| **Objective reference** | Which workflow objective this serves |
| **Target fields** | For Ask/Collect: which facts are needed |
| **Tool requests** | For Invoke Tool: which tool(s) and with what logical parameters |
| **Confidence** | Agent certainty in interpretation (high / medium / low) |
| **Rule flags** | Business rules triggered (e.g., needs human coordinator) |
| **Escalation reason** | If Escalate: categorized cause |
| **Retry hint** | If recovering from failure: bounded retry strategy |

## 3.4 Determining current workflow

Priority order:

1. **Explicit active workflow** on the conversation (set at lead entry or org configuration)
2. **Workflow recommendation** from organization default for this lead source
3. **Fallback generic intake workflow** if none registered

The Agent never hardcodes "recruiting." It reads workflow identity from the Workflow Registry.

Switching workflows mid-conversation requires a defined workflow transition rule (future marketplace concern). Default: no silent switch.

## 3.5 Determining current conversation state

State is **workflow-native**, not Agent-native:

- Workflow Engine exposes: current step, collected data, validation status, completion percentage
- Conversation Engine exposes: ownership, stall timers, last Atlas message timestamp
- Business Rules Engine exposes: blocking flags

The Decision Engine **reads** state; Workflow Engine **owns** state transitions.

## 3.6 Determining current objective

Each workflow publishes an ordered list of **Objectives**. Example (recruiting):

1. Establish contact
2. Qualify prospect
3. Determine interview type
4. Schedule interview
5. Confirm appointment

The Decision Engine identifies the **first incomplete objective** using workflow completion rules. All actions must serve that objective unless escalation or explicit prospect digression handling applies.

## 3.7 Determining missing information

Missing information comes from workflow **Required Data** definitions:

- Required fields per step
- Validation rules (format, eligibility)
- Conditional requirements (e.g., email required only for Zoom)

The Decision Engine compares Collected Facts against Required Data. Missing items become candidate **Ask** targets. Priority: required before optional; blocking before non-blocking.

## 3.8 Next best action selection

Decision priority (first match wins):

| Priority | Condition | Action |
|----------|-----------|--------|
| 1 | Ownership ≠ Atlas | No-op or ack-only if policy allows |
| 2 | Business rule blocks automation | Escalate |
| 3 | Prospect requests human | Escalate |
| 4 | Low confidence on critical intent | Ask clarifying question OR Escalate |
| 5 | Workflow step requires tool invocation | Invoke Tool |
| 6 | Required data missing | Ask (one focused question) |
| 7 | Confirmation pending | Confirm |
| 8 | Prospect question answerable from memory/rules | Answer |
| 9 | Objective complete | Workflow Engine advances; next objective |
| 10 | Default | Answer with guidance toward objective |

**One-question rule:** Prefer a single clear Ask over multi-part questionnaires. Aligns with BR-014 (never re-ask completed qualification).

## 3.9 When to answer

Answer when:

- Prospect asked an informational question
- Answer content is grounded in Collected Facts, organization settings, or Business Rules
- Answering does not skip a blocking workflow step
- Confidence is sufficient for the topic sensitivity

Do not answer with fabricated specifics (dates, addresses, links). If unknown, Ask or Escalate.

## 3.10 When to ask

Ask when:

- Required data is missing for the current step
- Prospect message is ambiguous and clarification unlocks progress
- Confirmation is needed before irreversible action

Do not ask for:

- Information already in Collected Facts with sufficient confidence
- Information that Business Rules say Atlas must not collect on this channel
- Multiple unrelated fields in one turn (unless workflow explicitly bundles them)

## 3.11 When to call services (tools)

Invoke tools when:

- Workflow step completion rule requires a side effect (schedule appointment, create meeting)
- Read-only lookup is needed (capacity, availability) and workflow permits it
- Post-completion automation is triggered by workflow event (handled asynchronously by domain subscribers)

Tools are **never** invoked on speculation. The Decision Record must cite the workflow rule that authorizes the call.

## 3.12 When to escalate

See Section 9. Decision Engine sets action type Escalate; Escalation Model handles handoff.

---

# 4. Memory Model

## 4.1 Purpose

Memory gives the Agent **continuity**. Without it, Atlas becomes a stateless chatbot. With it, Atlas becomes an employee who remembers the prospect, the progress, and the commitments.

Memory splits into **structured** (machine-reliable) and **narrative** (human-readable compression).

## 4.2 Core entities

### Conversation

The thread of interaction for one prospect under one organization.

- Links to prospect, organization, active workflow, ownership mode
- Holds message transcript reference (not duplicate storage of raw logs)
- Tracks last activity, stall timers, channel of last contact

### Prospect

The person Atlas is serving.

- Stable Atlas identity across channels
- Display name, contact methods, source
- Relationship to organization

### Organization

The agency Atlas works for.

- Meeting preferences, locations, integration status
- Default workflows and policy profile

### Workflow

The active business process instance.

- Workflow type and version
- Current step and state
- Collected data snapshot
- Completion and validation status

### Appointment

A scheduled commitment (Journey 2 domain).

- Linked to prospect and organization
- Status: scheduled, confirmed, etc.
- Confirmation artifact reference

### Meeting

The prepared meeting experience (Journey 3 domain).

- Calendar linkage, virtual meeting linkage
- Lifecycle status, reminders
- Derived from confirmed appointment

### Collected Facts

Structured key-value data extracted from conversation and tools.

- Authoritative for Decision Engine and Workflow Engine
- Each fact carries: key, value, source (prospect said / tool result / agent inferred), confidence, collected at
- Inferred facts require higher scrutiny before use in commitments

### Conversation Summary

Rolling natural-language compression of older transcript.

- Updated when transcript exceeds window size
- Used for operator handoff and long-thread context
- Must not contradict Collected Facts; Facts win on conflict

### Preferences

Prospect-stated preferences (time of day, meeting type, language).

- Promoted from Collected Facts when stable
- Override defaults where Business Rules allow

### Sentiment

Coarse emotional signal (neutral, positive, frustrated, confused).

- Influences escalation threshold
- Never used to deny service

### Confidence

Per-turn and per-fact certainty scores.

- Drives Ask vs Answer vs Escalate
- Low confidence on scheduling commitments triggers Confirm action

### Pending Tasks

Work Atlas or a human still owes.

- Examples: send confirmation (when delivery exists), await prospect reply, coordinator review

### Completed Tasks

Closed loop items for audit.

- Examples: appointment confirmed, meeting ready, qualification complete

## 4.3 Memory evolution during a conversation

| Event | Memory update |
|-------|---------------|
| Inbound message | Append transcript; extract candidate facts; update sentiment |
| Decision: Ask | Record pending question; do not mark fields collected |
| Prospect answers | Promote facts to Collected Facts if validation passes |
| Tool success | Merge tool payload into Collected Facts; mark task complete |
| Workflow advance | Update step; refresh pending tasks from workflow |
| Escalation | Write summary; snapshot full context for operator |
| Stall timeout | Flag conversation; increment escalation priority |
| Cross-session return | Load Collected Facts + summary; skip re-qualification per BR-014 |

## 4.4 Memory authority rules

1. **Collected Facts beat summary text** for decisions.
2. **Tool results beat inferred facts** for commitments.
3. **Business Rules beat Agent inference** always.
4. **Workflow required-data validation** beats loose extraction.
5. Summaries are **lossy**; never use summary alone to schedule or confirm.

## 4.5 Retention tiers

| Tier | Content | Retention |
|------|---------|-----------|
| Hot | Recent messages, active facts, current workflow | Active conversation |
| Warm | Summary, completed tasks, appointment/meeting links | Life of prospect |
| Cold | Full transcript archive | Organization policy / compliance |

---

# 5. Workflow Interface

## 5.1 Principle

**The Agent consumes workflows. It does not contain workflows.**

Recruiting, mortgage, insurance, and demo scheduling are **workflow packages**. The Agent binary is workflow-agnostic.

## 5.2 Workflow contract

Every workflow package registers a descriptor consumed by Workflow Engine and Decision Engine.

### Identity

- Workflow name and version
- Supported channels
- Supported organization types

### Objectives

Ordered list of business outcomes the workflow pursues.

Each objective includes:

- Description (internal)
- Entry conditions
- Exit conditions (completion rules)

### Steps

Fine-grained states within objectives.

Each step defines:

- Allowed Decision action types
- Required data at entry
- Required data at exit
- Valid tool invocations

### Required data

Field catalog:

- Name, type, validation rule reference
- Required vs optional
- Conditional visibility (depends on other fields)
- Collection priority

### Completion rules

Deterministic conditions that mark an objective or step complete.

Examples: all required fields present; appointment confirmed event received.

Completion rules are **not** LLM-judged.

### Fallback rules

What to do when prospect diverges, refuses, or stalls.

Examples: offer FAQ answer then redirect; after N misunderstandings, escalate.

### Escalation rules

Workflow-specific triggers beyond global Agent rules.

Examples: outside coverage in-person request (BR-022); sensitive compliance topic.

## 5.3 Agent ↔ Workflow interaction

| Agent asks Workflow | Workflow returns |
|---------------------|------------------|
| What is the active objective? | Objective id + status |
| What data is missing? | Field list |
| Is action X allowed? | Allow / deny + reason |
| Apply collected data | Validation result + state delta |
| Advance | New state or error |

Workflow never generates customer text.

## 5.4 Event coupling

Workflows emit domain events (e.g., interview requested, validation failed). Domain services subscribe. The Agent learns outcomes through tool results and event feedback on subsequent turns — not by subscribing directly.

This preserves event-driven architecture established in Journeys 2–3.

## 5.5 Marketplace implication

New verticals ship as workflow packages plus optional tool adapters. The Agent core remains unchanged.

---

# 6. Tool Calling Interface

## 6.1 Principle

**The Agent requests work. Services perform work.**

Tools are the only sanctioned side-effect boundary for the Agent.

## 6.2 Tool categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **Read** | Fetch state without mutation | Get capacity, get prospect, get appointment |
| **Write** | Create or update business records | Create appointment, save collected field |
| **Prepare** | Trigger asynchronous preparation | Prepare meeting (calendar, Zoom, reminders) |
| **Deliver** | Future: send via channel | Send confirmation email, WhatsApp template |
| **Escalate** | Transfer to human systems | Create Mission Control attention item |

## 6.3 Tool descriptor

Each tool exposes:

| Property | Purpose |
|----------|---------|
| Name | Stable identifier |
| Category | Read / Write / Prepare / Deliver / Escalate |
| Authorization | Which workflow steps may invoke |
| Input contract | Logical parameters (names and types described in prose spec, not code) |
| Output contract | Success payload and error categories |
| Idempotency | Whether safe to retry |
| Side effects | What events or records change |

## 6.4 Current and future tools

### Implemented domains (Journeys 2–3)

| Tool | Domain | Agent use |
|------|--------|-----------|
| Create appointment from interview request | Appointments | After workflow emits interview requested |
| Confirm appointment | Appointments | Confirmation artifact generation |
| Prepare meeting | Meetings | Calendar, Zoom, reminders after confirmation |
| Get meeting status | Meetings | Answer "Is my meeting ready?" |

### Planned tools

| Tool | Domain |
|------|--------|
| Check scheduling capacity | Capacity |
| Lookup prospect | Prospect Center |
| Write CRM note | CRM |
| Send email | Delivery |
| Send WhatsApp | Delivery |
| Send Messenger | Delivery |
| Generate document | Documents |
| Process payment link | Payments |

## 6.5 Tool execution rules

1. Decision Engine + Workflow Engine must authorize before Tool Executor runs.
2. Tools return structured results; Response Generator phrases outcomes.
3. Tool failure does not automatically escalate — Decision Engine chooses retry, alternate path, or escalate based on severity.
4. Tools are channel-blind; Communication Gateway handles delivery.
5. Simulator mode mocks external tools without changing Agent logic.

## 6.6 Anti-patterns (forbidden)

- Agent calling Google Calendar API directly
- Agent embedding SQL or repository access
- Agent sending WhatsApp messages without going through Gateway
- Agent bypassing Business Rules Engine for scheduling decisions

---

# 7. Response Strategy

## 7.1 Purpose

Responses are the **visible output** of the Agent. They must feel like a competent employee, not a script reader.

## 7.2 Voice attributes

| Attribute | Guideline |
|-----------|-----------|
| **Natural** | Conversational grammar; contractions acceptable where brand allows |
| **Professional** | Respectful, clear, no slang unless organization tone permits |
| **Brief** | One idea per message when possible; mobile-first |
| **Helpful** | Answer the question, then orient toward the objective |
| **Goal-oriented** | Every message moves toward the workflow outcome |

## 7.3 Generation model

Response Generator receives:

- Decision Record (what to accomplish this turn)
- Collected Facts and organization context
- Workflow-supplied templates hints (optional phrasing guides, not rigid scripts)
- Business rule constraints on what may be promised

Generation is ** constrained creativity**: language varies; facts do not.

## 7.4 Rules

| Rule | Rationale |
|------|-----------|
| Never robotic | Avoid "I am an AI" disclaimers unless legally required |
| Never repetitive | Do not re-ask known facts (BR-014) |
| Never ask for known information | Check Collected Facts first |
| Always use available context | Reference name, city, prior choices when natural |
| One primary ask per message | Reduces prospect confusion |
| Confirm before irreversible commitments | Especially date, time, location, meeting type |
| No hallucinated specifics | Dates, URLs, addresses must come from tools or org settings |
| Match channel norms | Shorter on SMS; templates on WhatsApp where required |

## 7.5 Response types by action

| Action | Response pattern |
|--------|------------------|
| Answer | Direct answer + soft forward prompt if objective incomplete |
| Ask | Single question + brief why if helpful |
| Confirm | Play back structured details; request explicit yes |
| Invoke Tool (success) | Natural confirmation of what was done + what happens next |
| Invoke Tool (failure) | Honest limitation + alternative (different time, human help) |
| Escalate | Warm handoff message + expectation setting |
| Wait | Only when necessary; prefer actionable guidance |

## 7.6 Multilingual and tone

Organization configuration may set default language and formality. Response Generator respects org tone profile. Workflow may override for regulated industries.

---

# 8. Safety Model

## 8.1 Purpose

Safety ensures Atlas **does not harm the business, the prospect, or trust** while pursuing automation.

Safety is layered: rules first, confidence second, human last.

## 8.2 Hallucination prevention

| Control | Mechanism |
|---------|-----------|
| Grounding requirement | Commitments only from Collected Facts, tool results, org settings |
| No fabricated URLs | Links must originate from confirmation or meeting records |
| Confirmation gate | Schedule and legal-sensitive actions require explicit confirm step |
| Post-generation validation | Safety filter checks response claims against Turn Context |
| Tool-or-silence | If data unavailable, Ask or Escalate — never invent |

## 8.3 Policy enforcement

- Business Rules Engine is authoritative (BR-001–BR-024+)
- Workflow escalation rules add vertical-specific policy
- Organization settings constrain meeting types and locations
- Channel policies (Meta templates, opt-in) enforced at Gateway before send

## 8.4 Data validation

- All Collected Facts pass workflow validation before state advance
- PII handling follows organization compliance profile
- Cross-field validation (email required for Zoom) is deterministic

## 8.5 Unknown answer behavior

When the prospect asks something outside knowledge:

1. Acknowledge limitation honestly
2. Offer to connect with a human if high stakes
3. Redirect to current objective when appropriate

Never guess on eligibility, pricing, legal, or medical advice unless workflow provides an approved knowledge source.

## 8.6 Escalation triggers

See Section 9.

## 8.7 Human handoff

Escalation preserves Decision Record, Collected Facts, summary, and last tool results. Operator receives **action context**, not raw logs only.

## 8.8 Confidence thresholds

| Level | Typical behavior |
|-------|------------------|
| High | Proceed with Answer, Ask, or Tool |
| Medium | Prefer Confirm or clarifying Ask |
| Low | Escalate or narrow Ask |

Critical actions (schedule, send legal info) require high confidence or explicit prospect confirmation.

## 8.9 Business rule enforcement

Business rules are evaluated:

- In Context Builder (flags)
- In Decision Engine (action blocking)
- In Workflow Engine (step transition)
- In Tool Executor (pre-flight)

Redundant checks are intentional defense in depth.

---

# 9. Escalation Model

## 9.1 Purpose

Escalation is **not failure**. It is the designed path when human judgment adds value or automation risks harm.

## 9.2 Escalation triggers

| Category | Examples |
|----------|----------|
| **Explicit request** | "Speak to a manager", "call me" |
| **Low confidence** | Repeated unclear intent on critical step |
| **Repeated misunderstanding** | N failed validation attempts on same field |
| **Policy restriction** | BR-022 outside-area in-person request; compliance block |
| **Sensitive issue** | Harassment, legal threat, self-harm indicators |
| **Stall** | BR-034: no prospect response 24h after Atlas message |
| **Tool failure** | Unrecoverable scheduling or integration failure |
| **Ownership** | Conversation already in Agent mode |

## 9.3 Escalation outcomes

| Outcome | Effect |
|---------|--------|
| Transfer ownership to Agent (human) | Pause automated messaging |
| Create Mission Control attention item | Priority queue entry |
| Write escalation summary | Operator briefing |
| Set pending task | Human completes; BR-035 return to Atlas |
| Notify operator | Future: push/email to assigned recruiter |

## 9.4 Context preservation

Escalation packet includes:

- Prospect identity and channel
- Active workflow and step
- Collected Facts (complete set)
- Conversation summary
- Last Decision Record and failure reason
- Recommended next action for human (from workflow + Business Rules)

Operator actions feed back through Mission Control and BR-035 milestone advancement — not by editing Agent memory ad hoc.

## 9.5 Return to Atlas

After human resolution:

- Human records outcome and milestone (BR-035)
- Ownership returns to Atlas without "Resume" button
- Agent resumes from highest valid completed milestone
- Never re-ask completed qualification (BR-014)

---

# 10. Testing Strategy

## 10.1 Purpose

The Atlas Agent must be testable **without manual chatting**. Architecture demands deterministic cores with simulated language layers.

## 10.2 Test layers

| Layer | What it validates |
|-------|-------------------|
| **Unit tests** | Decision Engine action selection; memory promotion rules; validation |
| **Workflow tests** | Step transitions, required data, completion rules per workflow package |
| **Conversation simulations** | Multi-turn scripts through full pipeline with mock AI |
| **Regression tests** | Golden scenarios — fixed transcripts must produce fixed decisions |
| **Edge cases** | Ambiguous dates, typos, language mixing, channel switches |
| **Memory consistency** | Facts not lost across turns; no re-ask of collected data |
| **Tool invocation** | Correct tool authorized, correct parameters, idempotency |
| **Escalation scenarios** | Triggers fire; ownership changes; context packet complete |

## 10.3 Simulation architecture

- **Mock language layer:** Fixed extractor maps message text → structured facts (pattern established in Journey verify scripts)
- **Simulator guard:** External tools mocked; business logic real
- **Event capture:** Assert workflow and domain events emitted
- **Dashboard assertions:** Read models reflect expected state

## 10.4 Golden scenarios

Maintain a catalog of end-to-end scenarios per workflow:

- Happy path to confirmed appointment and meeting ready
- Local vs remote coverage paths
- Zoom vs office selection
- Human escalation and return
- Stall and BR-034 escalation
- Validation failure recovery

Golden scenarios run in CI on every release branch.

## 10.5 Non-goals for Agent tests

- Do not test LLM phrasing variability in CI
- Do not test external API contracts in unit tests (mock at tool boundary)
- Do not test UI layout in Agent test suite

## 10.6 Quality gates

| Gate | Criteria |
|------|----------|
| Journey verify scripts | Pass end-to-end for active journeys |
| Workflow package verify | Each marketplace workflow has dedicated script |
| Regression | Prior journey scripts remain green |
| Escalation coverage | Every trigger category has at least one test |
| Memory | No re-ask scenarios explicitly asserted |

---

# Appendix A — Component map (existing → target)

| Current (repository) | Target Agent role |
|----------------------|-------------------|
| Communication Gateway | Pipeline ingress/egress (keep) |
| MessageRouter + AIAdapter | Evolve into Conversation Engine + Response Generator |
| Workflow Engine (Sprint 13) | Pipeline stage (keep) |
| Business Rules Engine | Context + Decision input (keep) |
| semanticConversationEngine (legacy) | Retire into Agent pipeline |
| Appointments / Meetings domains | Tools behind Tool Executor (keep) |
| Mission Control | Escalation target (keep) |

---

# Appendix B — Glossary

| Term | Definition |
|------|------------|
| **Atlas Agent** | AI Employee orchestration layer defined in this document |
| **Turn** | One inbound message processed through the full pipeline |
| **Decision Record** | Structured output of Decision Engine for one turn |
| **Tool** | Sanctioned service invocation boundary |
| **Objective** | Workflow-level business goal |
| **Collected Facts** | Structured memory extracted from conversation and tools |
| **Ownership** | Who may send automated messages: Atlas, Agent, Waiting, Closed |

---

# Appendix C — Success criteria (this document)

| Criterion | Status |
|-----------|--------|
| Every pipeline stage has single responsibility | Defined |
| Decision Engine separated from execution | Defined |
| Memory model covers all required entities | Defined |
| Workflow contract enables marketplace verticals | Defined |
| Tool interface prevents direct integration coupling | Defined |
| Response, safety, and escalation models complete | Defined |
| Testing strategy supports CI and golden scenarios | Defined |
| No implementation code in document | Satisfied |

---

# Document maintenance

This is the **permanent blueprint** for Atlas AI development. Changes require architecture review.

Implementation journeys (5+) must reference this document and note any intentional deviations.

**Remember: Simple Scales.**
