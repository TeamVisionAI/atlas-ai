# Journey #5 — Atlas Agent

**Status:** IN PROGRESS  
**Depends on:** Journey #4 (architecture — locked)

## Increment 1 — Conversation Core

**Status:** IMPLEMENTED

### Objective

Implement the foundation of the Atlas Agent: transform inbound messages into structured Decision Records and natural responses.

No workflow execution. No business services. No side effects.

### Pipeline

```
Incoming Message
  → Context Builder
  → Memory Loader
  → Decision Engine
  → Response Generator
  → Decision Record + Response
```

### Domain

`backend/agent/`

| Module | Responsibility |
|--------|----------------|
| `ConversationEngine.js` | Pipeline orchestration |
| `ContextBuilder.js` | Assemble turn context |
| `MemoryLoader.js` | Load conversation memory |
| `DecisionEngine.js` | Produce one Decision Record |
| `ResponseGenerator.js` | Generate natural response |
| `DecisionRecord.js` | Decision contract |
| `AgentStore.js` | JSON persistence |
| `AgentEvents.js` | Event constants |

### Decision types

- ANSWER
- ASK
- WAIT
- ESCALATE
- TOOL_REQUEST (placeholder — no execution)

### Events

- `agent.message.received`
- `agent.context.loaded`
- `agent.memory.loaded`
- `agent.decision.created`
- `agent.response.generated`

### Increment 2 — Workflow Intelligence

**Status:** IMPLEMENTED

The Decision Engine is workflow-aware via `backend/workflows/intelligence/`.

| Module | Responsibility |
|--------|----------------|
| `WorkflowContracts.js` | Workflow contract definitions |
| `WorkflowRegistry.js` | Contract registration |
| `WorkflowLoader.js` | Load workflow + emit `workflow.loaded` |
| `WorkflowState.js` | Persist agent workflow state |
| `WorkflowNavigator.js` | Recommend current/next step |
| `WorkflowValidator.js` | Validate step required data |
| `WorkflowEvents.js` | Intelligence events |

Decision Records now include: workflow name, current step, next step, completion %, blocking reason, workflow confidence.

### Events (Increment 2)

- `workflow.loaded`
- `workflow.state.updated`
- `workflow.step.completed`
- `workflow.ready`

### Increment 3 — Tool Execution

**Status:** IMPLEMENTED

Tool layer: `backend/agent/tools/`

| Module | Responsibility |
|--------|----------------|
| `ToolRequest.js` | Standard tool request contract |
| `ToolResult.js` | Standard tool result contract |
| `ToolRegistry.js` | Register Appointment, Meeting, Calendar tools |
| `ToolValidator.js` | Validate requests against registry |
| `ToolExecutor.js` | Orchestrate validate → execute → record |
| `ToolRequestBuilder.js` | Translate TOOL_REQUEST into tool requests |
| `ExecutionHistory.js` | Persist execution audit trail |
| `ToolEvents.js` | Tool event constants |

### Events (Increment 3)

- `agent.tool.requested`
- `agent.tool.validated`
- `agent.tool.executed`
- `agent.tool.failed`
- `agent.tool.completed`

### Increment 4 — Autonomous Conversations

**Status:** IMPLEMENTED

Runtime layer: `backend/agent/runtime/`

| Module | Responsibility |
|--------|----------------|
| `AutonomousConversationRuntime.js` | Full lifecycle orchestration |
| `ConversationSession.js` | Session persistence |
| `ConversationLifecycle.js` | Status and outcome transitions |
| `ConversationSummary.js` | Structured outcome summaries |
| `ContextRecovery.js` | Resume after gaps |
| `InterruptionHandler.js` | Answer + resume workflow |
| `SessionEvents.js` | Lifecycle event constants |

### Events (Increment 4)

- `conversation.started`
- `conversation.updated`
- `conversation.resumed`
- `conversation.completed`
- `conversation.summary.created`
- `conversation.closed`

### Verify

```bash
node backend/dev/verifyJourney5Increment1.js
node backend/dev/verifyJourney5Increment2.js
node backend/dev/verifyJourney5Increment3.js
node backend/dev/verifyJourney5Increment4.js
```

### Out of scope (Increment 1)

Workflow execution, appointments, meetings, calendar, Zoom, CRM, reminders, notifications, business rules engine, LLM, vector search.

### Architecture reference

[../02-architecture/ATLAS_AGENT_ARCHITECTURE.md](../../../../02-architecture/ATLAS_AGENT_ARCHITECTURE.md)
