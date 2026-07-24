# Prompt Library

## AI Summary

Reusable prompt templates for Atlas engineering: sprint planning, BR compliance checks, Knowledge Hub updates, and integration debugging. Copy and adapt placeholders marked `{like_this}`.

## Purpose

Standardize high-quality prompts for humans and AI when working on Atlas.

## Status

Draft — Sprint 13.1 placeholders

## Business Rules

Prompts that change product behavior must reference or propose Business Rules.

---

## Sprint kickoff

```
Read docs/CURRENT_STATE.md and docs/06-business/BUSINESS_RULES.md.
Implement Sprint {N} scope: {description}.
Do not duplicate documentation. Update CURRENT_STATE when done.
```

## Business rule check

```
Before coding, verify whether BR-XXX covers {feature}.
If not, recommend a new rule in BUSINESS_RULES.md.
```

## Knowledge Hub update

```
After implementation, update docs/CURRENT_STATE.md sections:
Working, In Progress, Next Actions, Recently Updated Documents.
Follow DOCUMENTATION_STANDARD.md.
```

## Meta / WhatsApp debug

```
Trace Embedded Signup pipeline for org {org_id}.
Read docs/05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md.
Report first failing step only.
```

## Related Documents

- [AI_GUIDELINES.md](./AI_GUIDELINES.md)
- [CONVERSATION_PATTERNS.md](./CONVERSATION_PATTERNS.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Initial prompt library structure |
