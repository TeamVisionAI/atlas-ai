# RFC-008 — Daily Brief Schema

**Status:** FROZEN  
**Version:** 1.0  
**Related:** Release 1.3 · [RFC-006](./RFC-006-organization-model.md)

---

## Purpose

Define the **permanent document schema** for the Atlas Daily Brief.

The Daily Brief answers: *"If I only had one minute, what do I need to know about my business today?"*

---

## Daily Brief Document

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | Yes | Brief identifier |
| `organizationId` | string | Yes | Organization |
| `organization` | string | Yes | Organization display name |
| `version` | number | Yes | Organization config version at generation |
| `date` | string (YYYY-MM-DD) | Yes | Brief date |
| `generatedAt` | string (ISO-8601) | Yes | Generation timestamp |
| `generationTimeMs` | number | No | Performance metric |
| `executiveSummary` | object | Yes | Summary section |
| `organizationHealth` | object | Yes | Health section |
| `keyMetrics` | object | Yes | Metrics section |
| `trends` | array | Yes | Trend comparisons |
| `insights` | array | Yes | Observations (no recommendations) |
| `priorities` | array | Yes | Ranked priorities |
| `recommendations` | array | Yes | Actionable recommendations |
| `todaySchedule` | object | Yes | Appointments and meetings |
| `connectorStatus` | array | Yes | Connector health snapshot |
| `packageStatus` | array | Yes | Installed package status |

---

## Executive Summary

| Field | Type | Description |
|-------|------|-------------|
| `lines` | string[] | Narrative summary lines |
| `recommendedAction` | string \| null | Top recommended action |
| `coachingLeader` | string | Organization name |

---

## Recommendation Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Recommendation identifier |
| `reason` | string | Why this is recommended |
| `priority` | string | `high`, `medium`, `low` |
| `suggestedAction` | string | Proposed action |
| `affectedWorkflow` | string \| null | Workflow name |
| `expectedOutcome` | string | Expected result |
| `confidence` | string | `high`, `medium`, `low` |

---

## Brief Events

| Event | When |
|-------|------|
| `brief.generated` | Brief successfully created |
| `brief.failed` | Generation failed |
| `brief.published` | Brief published to consumer |
| `brief.metrics.collected` | Metrics phase complete |
| `brief.insights.generated` | Insights phase complete |
| `brief.recommendations.generated` | Recommendations phase complete |

---

## Invariants

1. **Insights contain observations only** — recommendations are a separate section.
2. **Recommendations never auto-execute** — human approval required.
3. **Formatter changes presentation only** — JSON and Markdown supported in V1.
4. **One brief per organization per date** — keyed by `{organizationId}:{date}`.

---

## Output Formats (Version 1)

| Format | Status |
|--------|--------|
| JSON | Supported |
| Markdown | Supported |
| PDF | Future |
| Email | Future |
| Dashboard | Future |

---

## Reference

`backend/intelligence/` — DailyBriefEngine, DailyBriefBuilder, BriefFormatter

**Verify:** `node backend/dev/verifyRelease1_3.js`
