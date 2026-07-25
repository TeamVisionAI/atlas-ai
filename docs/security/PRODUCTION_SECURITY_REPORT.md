# Atlas Production Security Report

**Audit type:** Principal Security Architect — production readiness  
**Date:** 2026-07-24  
**Scope:** Recruiting & communications (full codebase reviewed)  
**Standards:** OWASP, least privilege, Privacy by Design  
**Verdict:** **Not production-ready** until Critical open items and RBAC phase are complete.

---

## Executive summary

Atlas Core engines are RC1-certified, but **recruiter-facing security posture is immature**. The highest risks were unauthenticated legacy APIs exposing full prospect PII and agent write actions, unsigned Facebook lead intake, optional WhatsApp webhook verification, shared bootstrap authentication, and absence of RBAC/RLS.

**Remediations applied in this audit** (security fixes only, no product features):

| Remediation | Files |
|-------------|-------|
| `requireAtlasUser` on all legacy PII routes | `dashboard.js`, `missionControl.js`, `prospectWorkspace.js`, `prospectCenter.js`, `timeline.js`, `organization.js`, `executiveDashboard.js` |
| Frontend sends auth on all API calls | `apiClient.js` |
| Bootstrap session disabled in production | `quickCapture.js`, `atlasUserService.js` |
| Meta webhook signatures required in production | `metaWebhookSignature.js` |
| Facebook lead webhook signature verification | `server.js` |
| Internal secret for `/api/recruiting/facebook-lead` in production | `recruitingWorkflow.js`, `requireInternalServiceSecret.js` |
| Meta onboarding routes require auth | `metaOnboarding.js` |
| CORS restricted in production | `server.js` |
| Production access log redaction | `safeRequestLogger.js` |

---

## PII inventory summary

See [PII_STANDARD.md](./PII_STANDARD.md) for full matrix.

**Highest-risk PII surfaces:** phone, name, email, conversation_logs, agent notes, recruiting milestone, calendar data.

**Roles today:** Any authenticated session (or previously: anyone unauthenticated on legacy routes) can access all prospect data. **No per-recruiter scoping.**

---

## Findings

### Critical

#### C-01 — Legacy APIs exposed full PII without authentication
| | |
|--|--|
| **Risk** | OWASP A01 Broken Access Control |
| **Impact** | Unauthenticated read of all prospects, messages, notes; unauthenticated agent actions (send WhatsApp, advance workflow) |
| **Evidence** | `backend/routes/dashboard.js`, `missionControl.js`, `prospectWorkspace.js`, `prospectCenter.js`, `timeline.js` — no auth before audit |
| **Recommendation** | Require authentication on all PII routes |
| **Effort** | S — **Remediated** |

#### C-02 — Facebook Lead intake unsigned
| | |
|--|--|
| **Risk** | OWASP A07 Identification and Authentication Failures |
| **Impact** | Arbitrary lead injection; triggers prospect creation and outbound WhatsApp |
| **Evidence** | `facebookLeadWebhook.js` POST had no signature; `recruitingWorkflow.js` public POST |
| **Recommendation** | Verify Meta signature; protect duplicate API with internal secret |
| **Effort** | S — **Remediated** (signature + internal secret in production) |

#### C-03 — WhatsApp webhook signature optional
| | |
|--|--|
| **Risk** | Forged inbound messages |
| **Impact** | Fake conversations, erroneous AI replies, data pollution |
| **Evidence** | `metaWebhookSignature.js` skipped verification when `META_APP_SECRET` unset |
| **Recommendation** | Fail closed in production |
| **Effort** | S — **Remediated** |

#### C-04 — Shared bootstrap authentication model
| | |
|--|--|
| **Risk** | OWASP A07 — no individual accountability |
| **Impact** | Single leaked `VITE_ATLAS_BOOTSTRAP_TOKEN` grants full access; not true multi-recruiter auth |
| **Evidence** | `atlasAuthService.js`, `quickCapture.js`, `atlasUserService.js` |
| **Recommendation** | Disable bootstrap in production; implement individual login (SSO/password) |
| **Effort** | M (bootstrap disabled) / **L** (full identity) — **Partially remediated** |

#### C-05 — No RBAC on recruiting data
| | |
|--|--|
| **Risk** | Any authenticated user accesses all prospects |
| **Impact** | Agents can view/edit prospects outside assignment; no RVP/Division boundaries |
| **Evidence** | No role checks in `agentActionController.js`, prospect controllers |
| **Recommendation** | Implement [RBAC_MODEL.md](./RBAC_MODEL.md) |
| **Effort** | **L** — Open |

#### C-06 — No Supabase Row Level Security
| | |
|--|--|
| **Risk** | Backend anon key bypasses database-level isolation |
| **Impact** | Compromised backend or direct Supabase access exposes all rows |
| **Evidence** | No RLS policies in `backend/database/migrations/`; `supabaseService.js` uses anon key only |
| **Recommendation** | Enable RLS + policies per org/assignment; consider service role for server writes |
| **Effort** | **L** — Open |

---

### High

#### H-01 — Meta Embedded Signup was unauthenticated
| | |
|--|--|
| **Risk** | Token exchange and connection metadata exposed |
| **Impact** | Stolen auth codes could bind WhatsApp; status leaks WABA metadata |
| **Evidence** | `metaOnboarding.js` |
| **Recommendation** | `requireAtlasUser` on all Meta routes |
| **Effort** | S — **Remediated** |

#### H-02 — CORS wide open
| | |
|--|--|
| **Risk** | Cross-origin abuse of authenticated sessions |
| **Impact** | Malicious site could call API if combined with XSS or stolen token |
| **Evidence** | `server.js` `app.use(cors())` |
| **Recommendation** | Restrict to `ATLAS_CORS_ORIGINS` in production |
| **Effort** | S — **Remediated** |

#### H-03 — PII in application logs
| | |
|--|--|
| **Risk** | Log aggregation exposes prospect data |
| **Impact** | Phones in access logs, WhatsApp logger, contact form traces, repository debug |
| **Evidence** | `server.js` (pre-redaction), `contact.js`, `whatsappStructuredLogger.js`, `SupabaseProspectRepository.js` |
| **Recommendation** | Redact PII in production logs; remove debug logging |
| **Effort** | M — **Partially remediated** (access log redaction) |

#### H-04 — No secure logout / session revocation
| | |
|--|--|
| **Risk** | Stolen session valid for 7 days |
| **Impact** | Cannot invalidate compromised recruiter sessions |
| **Evidence** | No logout route; `atlas_sessions` delete API absent |
| **Recommendation** | Add `POST /api/auth/logout` deleting session row |
| **Effort** | S — Open |

#### H-05 — Organization settings exposed without auth
| | |
|--|--|
| **Risk** | Information disclosure (Zoom URL, office address) |
| **Impact** | Competitors scrape interview links |
| **Evidence** | `organization.js` |
| **Recommendation** | Require authentication |
| **Effort** | S — **Remediated** |

#### H-06 — Business Events / Prospects accept client `organizationId`
| | |
|--|--|
| **Risk** | Horizontal privilege escalation when multi-tenant |
| **Impact** | User could query another org's events by ID |
| **Evidence** | `businessEvent.controller.js`, `prospect.controller.js` |
| **Recommendation** | Bind org filter to authenticated user's org |
| **Effort** | M — Open |

#### H-07 — OpenAI not in production readiness gate
| | |
|--|--|
| **Risk** | Silent failure of AI replies |
| **Impact** | Prospects unanswered; no pre-launch warning |
| **Evidence** | `productionReadiness.js` omits OpenAI; `openaiProvider.js` throws at runtime |
| **Recommendation** | Add readiness check for `OPENAI_API_KEY` |
| **Effort** | S — Open |

#### H-08 — Operations Center destructive APIs in production
| | |
|--|--|
| **Risk** | Admin compromise resets projections |
| **Impact** | Mission Control / dashboard data loss |
| **Evidence** | `/api/operations/replay/reset` mounted in production when enabled |
| **Recommendation** | Keep disabled unless `ENABLE_OPERATIONS_CENTER=true`; audit admin actions |
| **Effort** | S — Mitigated by access gate; durable audit open |

#### H-09 — Client-side workflow state in localStorage
| | |
|--|--|
| **Risk** | PII persistence on shared devices |
| **Impact** | Workflow state keyed by phone in `workflowEngine.js` |
| **Evidence** | `frontend/src/engines/workflowEngine.js` |
| **Recommendation** | Move workflow state server-side only for production |
| **Effort** | M — Open |

---

### Medium

#### M-01 — In-memory rate limits only
| | |
|--|--|
| **Risk** | Brute force / spam |
| **Impact** | Contact form and Meta exchange limits reset on restart; no global API limits |
| **Evidence** | `contact.js`, `metaEmbeddedSignupRateLimit.js` |
| **Recommendation** | Redis or edge rate limiting |
| **Effort** | M — Open |

#### M-02 — `/health/production` exposes configuration status
| | |
|--|--|
| **Risk** | Information disclosure |
| **Impact** | Attackers learn which integrations missing |
| **Evidence** | `health.js`, `productionReadiness.js` |
| **Recommendation** | Restrict health detail to internal network or auth |
| **Effort** | S — Open |

#### M-03 — Incomplete audit trail
| | |
|--|--|
| **Risk** | Cannot investigate incidents |
| **Impact** | No login/view/export audit events |
| **Evidence** | [AUDIT_LOGGING.md](./AUDIT_LOGGING.md) |
| **Recommendation** | Unified audit event stream |
| **Effort** | M — Open |

#### M-04 — Error messages leak details in development
| | |
|--|--|
| **Risk** | A05 Security Misconfiguration |
| **Impact** | Stack traces in non-production environments |
| **Evidence** | `server.js` error handler |
| **Recommendation** | Already hidden in production — verify deploy config |
| **Effort** | S — Verify only |

#### M-05 — Duplicate prospect systems (legacy + Core)
| | |
|--|--|
| **Risk** | Inconsistent access paths and data |
| **Impact** | Security controls must apply to both `prospects` and `atlas_core_prospects` |
| **Evidence** | Bridge in `recruitingProspectBridge.js` |
| **Recommendation** | Document and enforce consistent auth on all read models |
| **Effort** | M — Ongoing |

#### M-06 — Mass assignment on legacy workflow PATCH
| | |
|--|--|
| **Risk** | Client merges arbitrary workflow fields |
| **Impact** | Agent state manipulation |
| **Evidence** | `POST /api/mission-control/:phone/workflow` |
| **Recommendation** | Allowlist fields (now auth-gated) |
| **Effort** | S — Open |

#### M-07 — `/api/recruit` public evaluation endpoint
| | |
|--|--|
| **Risk** | Low — echoes candidate input |
| **Impact** | Minimal PII unless abused |
| **Evidence** | `recruit.js` |
| **Recommendation** | Rate limit or disable in production |
| **Effort** | S — Open |

---

### Low

#### L-01 — Session token in localStorage (XSS exposure)
| | |
|--|--|
| **Risk** | Token theft via XSS |
| **Impact** | Full session compromise |
| **Evidence** | `atlasAuthService.js` |
| **Recommendation** | HttpOnly secure cookies when login UI exists |
| **Effort** | M — Open |

#### L-02 — Dev simulator routes unauthenticated when enabled
| | |
|--|--|
| **Risk** | Dev-only data manipulation |
| **Impact** | None in production if `NODE_ENV=production` |
| **Evidence** | `server.js`, `simulatorRoutes.js` |
| **Recommendation** | Verify production deploy |
| **Effort** | S — Verify |

#### L-03 — Knowledge Hub path traversal mitigated but reads full docs tree
| | |
|--|--|
| **Risk** | Internal doc exposure to any authenticated user |
| **Impact** | Low for recruiting PII |
| **Evidence** | `knowledgeHubService.js` |
| **Recommendation** | Acceptable for internal tool |
| **Effort** | — |

#### L-04 — Mock queue in Mission Control UI
| | |
|--|--|
| **Risk** | Misleading data (not a direct PII leak) |
| **Impact** | Wrong prioritization |
| **Evidence** | `queueEngine.js` |
| **Recommendation** | Disable in production builds |
| **Effort** | S — Open |

---

## Webhook security matrix

| Endpoint | GET verify | POST signature | Status |
|----------|------------|----------------|--------|
| `/webhook` (WhatsApp) | VERIFY_TOKEN | Required in prod | Remediated |
| `/webhook/messenger` | VERIFY_TOKEN | Required in prod | Remediated |
| `/webhook/facebook-leads` | Token | Required in prod | Remediated |
| `/api/recruiting/facebook-lead` | N/A | Internal secret in prod | Remediated |

---

## Authentication matrix (post-remediation)

| Endpoint group | Auth required |
|----------------|---------------|
| Dashboard, Mission Control legacy, Prospect Center, Workspace, Timeline, Organization, Executive legacy | Yes — Bearer session |
| Prospects, Business Events, Timeline module, Knowledge | Yes |
| Quick Capture | Yes |
| Meta onboarding | Yes |
| Operations Center | Yes + admin email |
| Auth bootstrap | **Blocked in production** |
| Contact form | Public (rate limited) |
| Health | Public |
| Webhooks | Signature/token |

---

## Communications audit

| Channel | PII handled | Outbound security | Failure handling | Gap |
|---------|-------------|-------------------|------------------|-----|
| WhatsApp | Phone, messages | Meta Cloud API + credentials | Logged; inline UI error | No delivery receipt UI |
| Facebook Lead | Phone, name, email | Webhook → intake | Success even if welcome fails | **Document** welcomeDelivered |
| Google Calendar | Email, time | OAuth refresh token server-side | Error at confirm time | No pre-flight check in UI |
| Email (Resend) | Contact form only | API key server-side | Disabled without key | OK |
| Messenger webhook | Same as WhatsApp path | Signature in prod | Logged | Lower traffic |

---

## Frontend security

| Check | Status |
|-------|--------|
| Secrets in bundle | **Risk** if `VITE_ATLAS_BOOTSTRAP_TOKEN` in prod build |
| Auth on all API calls | **Remediated** |
| PII in localStorage | Session token only + workflow state by phone (**H-09**) |
| Sensitive env exposure | `VITE_*` is public by design |

---

## Remediation roadmap (effort)

| Priority | Item | Effort |
|----------|------|--------|
| 1 | Individual recruiter login (replace bootstrap) | L |
| 2 | RBAC + prospect scoping | L |
| 3 | Supabase RLS policies | L |
| 4 | Remove PII from all production logs | M |
| 5 | Secure logout + session revoke | S |
| 6 | Org-scoped query enforcement | M |
| 7 | OpenAI in readiness checks | S |
| 8 | Unified audit logging | M |
| 9 | Disable mock queue in production | S |

---

## Production gate decision

**Do not launch** to Team Vision recruiters until:

1. Critical **C-05** and **C-06** (RBAC + RLS) have a minimum viable implementation  
2. Critical **C-04** has individual login (bootstrap fully removed from prod workflow)  
3. [PRODUCTION_SECURITY_CHECKLIST.md](./PRODUCTION_SECURITY_CHECKLIST.md) signed off  
4. Penetration test confirms legacy routes return 401 without token  

---

## Related documentation

- [SECURITY_CHARTER.md](./SECURITY_CHARTER.md)
- [PII_STANDARD.md](./PII_STANDARD.md)
- [RBAC_MODEL.md](./RBAC_MODEL.md)
- [Privacy and Data Handling](../07-security/Privacy_and_Data_Handling.md)

**Report version:** 1.0 — 2026-07-24
