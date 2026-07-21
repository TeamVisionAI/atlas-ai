# RFC-004 — Workflow Contract

**Status:** FROZEN  
**Version:** 1.0  
**Related:** [RFC-005](./RFC-005-package-manifest.md) · Journey #5 Inc 2

---

## Purpose

Define the **permanent contract** for workflow definitions registered with Workflow Intelligence.

Packages register workflows; Core provides the engine.

---

## Workflow Contract

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique workflow identifier (e.g. `team-vision-recruiting`) |
| `version` | string | Yes | Semantic version |
| `description` | string | No | Human-readable description |
| `steps` | array | Yes | Ordered step definitions |
| `transitions` | array | Yes | Valid step transitions |
| `requiredFields` | array | No | Fields that must be collected |
| `configuration` | object | No | Package-provided default configuration |

---

## Step Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Step identifier |
| `name` | string | Yes | Display name |
| `objective` | string | No | What this step accomplishes |
| `requiredFields` | array | No | Fields required to complete step |

---

## Workflow State

Per-conversation state stored by Workflow Intelligence:

| Field | Type | Description |
|-------|------|-------------|
| `workflowName` | string | Active workflow |
| `currentStep` | string | Current step id |
| `collectedData` | object | Facts collected so far |
| `completedSteps` | array | Steps marked complete |
| `updatedAt` | string (ISO-8601) | Last update |

---

## Workflow Events

| Event | When |
|-------|------|
| `workflow.loaded` | Workflow contract loaded for conversation |
| `workflow.state.updated` | State mutation |
| `workflow.step.completed` | Step marked complete |
| `workflow.ready` | Workflow reached ready/completion state |

---

## Invariants

1. **Workflows are registered, not embedded** — packages call `WorkflowRegistry.register()`.
2. **Core never hardcodes package step names** — navigation uses contract.
3. **State is per-conversation** — not global.
4. **Validation before transition** — WorkflowValidator enforces contract.

---

## Non-Goals

- Visual workflow designer (future)
- BPMN compatibility

---

## Reference

`backend/workflows/intelligence/` — WorkflowRegistry, WorkflowLoader, WorkflowState, WorkflowNavigator

**Verify:** `node backend/dev/verifyJourney5Increment2.js`
