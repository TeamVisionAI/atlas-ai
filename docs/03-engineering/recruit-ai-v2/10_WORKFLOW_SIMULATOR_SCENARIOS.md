# Recruit AI v2 — Workflow Simulator Scenario Pack

**Status:** Implemented (ephemeral simulation only)  
**Related:** BR-081, BR-082  
**UI:** Operations Center → Workflow Simulator → **Recruit AI v2 Scenarios**

## Principle

Each scenario runs:

prospect turn → v2 context (ephemeral) → interpret → decide → response plan/render → side-effect proposal → **deny authorization** → expected-vs-actual → next turn

Uses the same sync pipeline as production shadow (`processRecruitAiV2TurnSync`).

## Safety

- Prospect IDs must be `sim-v2-*` or `fixture-*`
- No writes to `recruit_ai_conversation_contexts` or `recruit_ai_v2_shadow_evaluations`
- No WhatsApp / appointment / Calendar / BR-080 mutations
- SideEffectAuthorizer forced deny-all for every turn
- Phone-like inbound text rejected

## API

| Method | Path |
|---|---|
| GET | `/api/operations/simulator/recruit-ai-v2/scenarios` |
| POST | `/api/operations/simulator/recruit-ai-v2/scenarios/:id/run` |
| POST | `/api/operations/simulator/recruit-ai-v2/scenarios/run-all` |

## Regression rule

**Every confirmed production Recruit AI defect must be converted into a deterministic simulator scenario before the defect is considered closed.**

## Modules

- `backend/dev/recruitAiV2ScenarioRunner.js`
- `backend/dev/recruitAiV2ScenarioDefinitions.js`
- `backend/dev/recruitAiV2ScenarioPack.js`
- Tests: `backend/test/recruitAiV2SimulatorScenarios.test.js`
