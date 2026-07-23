# RFC-003 — Tool Contract

**Status:** FROZEN  
**Version:** 1.0  
**Related:** [02-architecture/ATLAS_AGENT_ARCHITECTURE.md](../02-architecture/ATLAS_AGENT_ARCHITECTURE.md) · Journey #5 Inc 3

---

## Purpose

Define the **permanent contract** between the Atlas Agent and domain services via Tool Execution.

Tools are the only approved mechanism for the Agent to cause side effects.

---

## Tool Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toolId` | string | Yes | Registered tool identifier |
| `conversationId` | string | Yes | Originating conversation |
| `organizationId` | string | No | Organization context |
| `parameters` | object | Yes | Tool-specific input (validated by schema) |
| `requestedAt` | string (ISO-8601) | Yes | Request timestamp |
| `requestedBy` | string | Yes | Always `agent` for automated requests |

---

## Tool Result

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toolId` | string | Yes | Tool that executed |
| `success` | boolean | Yes | Execution outcome |
| `data` | object | No | Result payload on success |
| `error` | string | No | Error message on failure |
| `executedAt` | string (ISO-8601) | Yes | Completion timestamp |

---

## Tool Events

| Event | When |
|-------|------|
| `agent.tool.requested` | Tool request created |
| `agent.tool.validated` | Parameters passed validation |
| `agent.tool.executed` | Domain service invoked |
| `agent.tool.completed` | Success path finished |
| `agent.tool.failed` | Validation or execution failed |

---

## Invariants

1. **Agent never calls domain services directly** — always through ToolExecutor.
2. **Every tool is registered** in ToolRegistry with parameter schema.
3. **Validation before execution** — ToolValidator rejects invalid requests.
4. **Execution history is persisted** — auditable in `toolExecutionHistory.json`.
5. **Tools are idempotent where possible** — safe to retry with RetryPolicy.

---

## Non-Goals

- LLM function-calling format (implementation detail)
- Direct HTTP calls from Agent

---

## Reference

`backend/agent/tools/` — ToolRegistry, ToolValidator, ToolExecutor, ToolRequest, ToolResult

**Verify:** `node backend/dev/verifyJourney5Increment3.js`
