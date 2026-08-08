# Recruit AI v2 — Custom Conversation Playground

**Status:** Implemented (ephemeral simulation only)  
**UI:** Operations Center → Workflow Simulator → **Recruit AI v2 Custom Conversation**  
**Related:** BR-081, BR-082, [10_WORKFLOW_SIMULATOR_SCENARIOS.md](./10_WORKFLOW_SIMULATOR_SCENARIOS.md)

## Purpose

Interactive turn-by-turn inspection of the Recruit AI v2 interpret → decide → plan → render → authorize pipeline.

Ops Center HTTP uses the **async** pipeline (`processRecruitAiV2Turn` via `runV2SimulatorTurnAsync` / `sendPlaygroundTurnAsync`) so BR-107/BR-108 can perform read-only Sprint 22 `getSlots` lookups. Sync `sendPlaygroundTurn` remains for offline unit tests/fixtures only.

## Safety

- Ephemeral in-memory sessions only (`sim-v2-playground-*`)
- Forced deny-all side-effect authorization
- No production context / shadow table writes
- No WhatsApp / appointment / Calendar / BR-080 mutations
- Rejects phone-like inbound text and non-simulator prospect IDs
- BR-109 — binds a read-only scheduling agent (org default or deterministic operating RVP) for live availability reads; never assigns/claims leads

## API

| Method | Path |
|---|---|
| GET | `/api/operations/simulator/recruit-ai-v2/playground/meta` |
| POST | `/api/operations/simulator/recruit-ai-v2/playground/sessions` |
| GET | `/api/operations/simulator/recruit-ai-v2/playground/sessions/:id` |
| POST | `/api/operations/simulator/recruit-ai-v2/playground/sessions/:id/turns` |
| POST | `/api/operations/simulator/recruit-ai-v2/playground/sessions/:id/reset` |
| POST | `/api/operations/simulator/recruit-ai-v2/playground/sessions/:id/regression-candidate` |

## Usage

1. Open Workflow Simulator.
2. Set initial language (Auto / English / Spanish) and optional meeting context.
3. **Start New Conversation**.
4. Type prospect messages (or click suggested prompts).
5. Inspect Atlas v2 proposed reply + diagnostics.
6. Expand **Current V2 Context** for sanitized state.
7. Optionally select an expectation before Send for PASS/FAIL.
8. **Save as Regression Candidate** copies a sanitized JSON payload (does **not** write scenario files).

## Regression-candidate workflow

Canonical process:

1. Real defect observed in production/shadow
2. Reproduce in playground
3. Save as Regression Candidate (copy sanitized JSON)
4. Convert manually into `recruitAiV2ScenarioDefinitions.js`
5. Fix the engine
6. Deterministic scenario must stay green permanently

Do **not** auto-write business-rule or scenario files from the browser.

## Modules

- `backend/dev/recruitAiV2CustomPlayground.js`
- Reuses `backend/dev/recruitAiV2ScenarioRunner.js`
- Tests: `backend/test/recruitAiV2CustomPlayground.test.js`
