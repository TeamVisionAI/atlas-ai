# Sprint 11.4 — WhatsApp Investigation & Strategic Pivot

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0513 |
| **Title** | Sprint 11.4 WhatsApp Investigation & Strategic Pivot |
| **Version** | 1.0 |
| **Status** | Approved |
| **Owner** | Atlas Development Team |
| **Date** | 2026-07-21 |
| **Related Sprint** | 11.4 |
| **Related Release** | Release-11.4 |

---

## Related documents

| Document | Description |
|----------|-------------|
| [09-releases/sprints/Sprint-11.4.md](../09-releases/sprints/Sprint-11.4.md) | Sprint 11.4 specification (DOC-0511) |
| [sprint-11.4-meta-production.md](../08-operations/deployment/sprint-11.4-meta-production.md) | Meta WABA / Cloud API production troubleshooting (DOC-0701) |
| [whatsapp-cloud-api-migration-checklist.md](../08-operations/deployment/archive/whatsapp-cloud-api-migration-checklist.md) | Cloud API migration checklist — **deferred** (DOC-0702) |
| [../02-architecture/atlas-communication-platform.md](../02-architecture/atlas-communication-platform.md) | Atlas Communication Platform architecture — Sprint 12 (DOC-0020)
| [00-executive/Current_System_State.md](../00-executive/Current_System_State.md) | Production system state |

---

## Objective

Investigate Meta WhatsApp Cloud API onboarding failures and determine the best production strategy for Atlas AI.

---

## Environment verified

### Business Portfolio

| Check | Result |
|-------|--------|
| Business Portfolio health | ✅ Healthy and operational |
| Atlas AI Developer App connection | ✅ Correctly connected |
| Facebook assets | ✅ Intact |
| Ad Account | ✅ Intact |
| Permissions | ✅ Verified |
| Business Portfolio ID | **`367219934273986`** (Team Vision Financial) |

### Developer App

| Field | Value |
|-------|-------|
| **App name** | Atlas AI |
| **Status** | ✅ Operational |
| **App ID** | **`1380354667410775`** |
| **Business Portfolio** | ✅ Connected to the correct portfolio |

Operational detail and incident timeline: [DOC-0701](../08-operations/deployment/sprint-11.4-meta-production.md).

---

## WhatsApp investigation

### WABA inventory discovered

Multiple WhatsApp Business Accounts (WABAs) exist under the Team Vision Financial portfolio:

| WABA | Status | Notes |
|------|--------|-------|
| Meta-generated **Test WABA** | **Disabled** | Auto-selected during failed Cloud API onboarding — do not use |
| **Team Vision Financial** WABA | **Disabled** | Portfolio-named account — restricted |
| **Ana Perez** WABA | **Approved** | **786-296-7254** — protected; out of scope for Atlas |
| **Niovel Perez** WABA | **Approved** | **786-752-8080** — designated Atlas production number |

### Onboarding failures

**Primary failure — existing WABA path**

Production onboarding consistently failed during **Add phone number** with:

> **`Unexpected null value for wabaID`**

- Occurred **before** SMS verification and **before** phone migration
- Business Portfolio misalignment **ruled out**
- App asset assignment via **Connect assets** **ruled out**
- Remaining evidence: Meta backend failure resolving WABA in the Step 2 registration flow

See [wabaID incident](../08-operations/deployment/sprint-11.4-meta-production.md#incident-unexpected-null-value-for-wabaid-2026-07-21) (DOC-0701).

**Secondary failure — new WABA recovery path**

A second recovery attempt followed [Meta AI guidance](../08-operations/deployment/sprint-11.4-meta-production.md#meta-ai-recovery-strategy--new-waba-proposed-2026-07-21): create a brand-new WABA under the same portfolio.

**UI verification (completed):** Business Settings → Accounts → WhatsApp Accounts → **Add** exposed both options:

- ✅ **Create a new WhatsApp Business Account**
- ✅ **Link a WhatsApp Business Account**

**Creation attempt failed** with:

> **"You cannot proceed with this operation since your WhatsApp Business account is currently restricted."**

### Conclusion

| Layer | Status |
|-------|--------|
| **Business Portfolio** | ✅ Appears healthy — ads, assets, app connection operational |
| **WhatsApp asset layer** | ❌ **Restricted** — onboarding blocked at WABA level |
| **Restricted asset identified?** | ⚠️ **Not yet** — exact restricted WABA or portfolio-level WhatsApp policy hold TBD |

The Business Portfolio itself is operational, but the **WhatsApp asset layer is restricted**. Atlas cannot complete Cloud API onboarding until Meta resolves the restriction.

---

## Strategic decision

**Do not allow WhatsApp restrictions to block Atlas development.**

Pivot the MVP to Meta messaging channels that remain available.

### Primary communication channels (Sprint 12+)

| Channel | Priority |
|---------|----------|
| **Facebook Messenger** | Primary |
| **Instagram Direct Messages** | Primary |

### Future channels

| Channel | Status |
|---------|--------|
| WhatsApp Cloud API | Deferred — resume after Meta restrictions resolved |
| Website Chat | Planned |
| SMS | Planned |
| Email | Planned |

WhatsApp migration checklist (DOC-0702) remains on file for when Meta restrictions are lifted; **do not block MVP delivery on WhatsApp completion**.

---

## Updated Atlas architecture

Atlas becomes **channel-independent**. Communication channels are **connectors** to a single AI engine — business logic is no longer coupled to a single messaging platform.

```
Facebook Messenger ──┐
Instagram DM ────────┤
WhatsApp (future) ───┼──► Atlas AI Core ──► Prospect Center ──► Mission Control ──► Executive Dashboard
Website Chat (future)┤
SMS / Email (future)─┘
```

**Principles:**

- One Conversation Engine serves all channels
- Channel adapters normalize inbound/outbound messages into a common format
- Prospect Center stores every interaction regardless of source
- Mission Control and Executive Dashboard operate on unified prospect data

Reference: [Communication Hub](../02-architecture/Communication_Hub.md) (DOC-0010) · [Atlas Communication Platform](../02-architecture/atlas-communication-platform.md) (DOC-0020).

---

## Product vision

Atlas evolves from:

> **"AI for WhatsApp"**

into:

> **"A multichannel AI communication platform for Team Vision Financial."**

---

## Sprint 12 priorities

1. Integrate **Facebook Messenger**
2. Integrate **Instagram Direct Messages**
3. Connect conversations to **Atlas AI** (Conversation Engine)
4. Store every interaction inside **Prospect Center**
5. Implement **Human Takeover** directly from Atlas
6. Connect interview scheduling with **Google Calendar**
7. Continue **Mission Control** development
8. Continue **Executive Dashboard** development
9. Treat **WhatsApp** as a future connector after Meta restrictions are resolved

---

## Human Takeover vision

Atlas operators should communicate with Messenger and Instagram conversations **directly from within Atlas** — without requiring Facebook Business Suite for day-to-day conversation handling.

Conversation ownership should support:

| Capability | Description |
|------------|-------------|
| **AI responses** | Automated replies via Conversation Engine |
| **Human takeover** | Operator assumes control from Atlas UI |
| **Conversation timeline** | Full message history per prospect |
| **Prospect history** | Cross-channel activity in Prospect Center |
| **Internal notes** | Team annotations not visible to prospect |
| **Status tracking** | Qualification stage, handoff state, follow-up |

---

## Final outcome

Sprint 11.4 concludes with a **strategic architectural improvement**.

Rather than depending on WhatsApp alone, Atlas will be built around a **unified communication engine** capable of supporting multiple messaging platforms through interchangeable connectors.

This decision improves **scalability**, **resilience**, and **long-term maintainability** of the Atlas platform.

---

## One-line summary

> **WhatsApp restricted at asset layer — pivot MVP to Messenger + Instagram. Atlas becomes multichannel; WhatsApp deferred.**
