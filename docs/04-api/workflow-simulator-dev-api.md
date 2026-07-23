# Sprint 8A.4a — Backend Workflow Simulator

**Status:** Implemented (backend only — no UI)  
**Spec:** [WORKFLOW_SIMULATOR_SPEC.md](../03-engineering/WORKFLOW_SIMULATOR_SPEC.md)

## Base path

`/dev/workflow`

## Run verification

```bash
node backend/dev/verifySprint8A4.js
node backend/dev/goldenScenarios.js  # via POST /dev/workflow/scenarios/run
```

## Golden scenarios

`POST /dev/workflow/scenarios/run` executes all 10 golden scenarios and returns structured reports with scenario recorder fields.
