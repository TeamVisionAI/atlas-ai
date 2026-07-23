#!/usr/bin/env python3
"""Create section READMEs and legacy redirect stubs."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

LEGACY_REDIRECTS = {
    "BUSINESS_RULES.md": "06-business/BUSINESS_RULES.md",
    "DEVELOPMENT_WORKFLOW.md": "03-engineering/DEVELOPMENT_WORKFLOW.md",
    "ENGINEERING_STANDARDS.md": "03-engineering/ENGINEERING_STANDARDS.md",
    "ATLAS_CORE_ARCHITECTURE.md": "02-architecture/ATLAS_CORE_ARCHITECTURE.md",
    "ATLAS_GLOSSARY.md": "06-business/ATLAS_GLOSSARY.md",
    "BACKLOG.md": "01-product/BACKLOG.md",
    "EVENT_CATALOG.md": "06-business/EVENT_CATALOG.md",
    "MILESTONE_DEFINITIONS.md": "06-business/MILESTONE_DEFINITIONS.md",
    "WORKFLOW_ENGINE_SPEC.md": "02-architecture/WORKFLOW_ENGINE_SPEC.md",
    "WORKFLOW_SEQUENCE_DIAGRAMS.md": "02-architecture/WORKFLOW_SEQUENCE_DIAGRAMS.md",
    "WORKFLOW_SIMULATOR_SPEC.md": "03-engineering/WORKFLOW_SIMULATOR_SPEC.md",
    "WHATSAPP_EMBEDDED_SIGNUP.md": "05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md",
    "SPRINT_8A_1.md": "09-releases/sprints/SPRINT_8A_1.md",
    "SPRINT_8A_2.md": "09-releases/sprints/SPRINT_8A_2.md",
    "SPRINT_8A_3.md": "04-api/mission-control-workflow-advance.md",
    "SPRINT_8A_4a.md": "04-api/workflow-simulator-dev-api.md",
    "SPRINT_10_2_PROSPECT_WORKSPACE.md": "09-releases/sprints/SPRINT_10_2_PROSPECT_WORKSPACE.md",
    "SPRINT_10_2B_ACTIVITY_FEED.md": "09-releases/sprints/SPRINT_10_2B_ACTIVITY_FEED.md",
    "SPRINT_10_3_PROSPECT_CENTER.md": "09-releases/sprints/SPRINT_10_3_PROSPECT_CENTER.md",
    "SPRINT_11_1_LIVE_WHATSAPP.md": "09-releases/sprints/SPRINT_11_1_LIVE_WHATSAPP.md",
}

STUB = """# Document moved

This file moved as part of **Atlas Documentation Foundation v1.0**.

**New location:** [{target}]({target})

See [Documentation Hub](README.md) for the full index.
"""

for name, target in LEGACY_REDIRECTS.items():
    path = DOCS / name
    path.write_text(STUB.format(target=target), encoding="utf-8")
    print("stub", name)

SECTION_READMES = {
    "00-executive/README.md": """# Executive documentation

| Document | ID | Purpose |
|----------|-----|---------|
| [Current_System_State.md](./Current_System_State.md) | DOC-0001 | Production snapshot — start here |
| [Roadmap.md](./Roadmap.md) | DOC-0005 | Planned and completed releases |
""",
    "01-product/README.md": """# Product documentation

| Document | Purpose |
|----------|---------|
| [Product_Vision.md](./Product_Vision.md) | Executive product vision (DOC-0006) |
| [WHY_ATLAS_EXISTS.md](./WHY_ATLAS_EXISTS.md) | Full vision narrative (V1 freeze) |
| [ATLAS_NEVER_SLEEPS.md](./ATLAS_NEVER_SLEEPS.md) | Continuous intelligence model |
| [BACKLOG.md](./BACKLOG.md) | Product backlog |
| [archive/v1-platform/](./archive/v1-platform/) | V1 platform branch reference (Journeys) |
""",
    "02-architecture/README.md": """# Architecture documentation

| Document | Purpose |
|----------|---------|
| [ATLAS_CORE_ARCHITECTURE.md](./ATLAS_CORE_ARCHITECTURE.md) | Workflow engine (Team Vision production path) |
| [ATLAS_PLATFORM_V1.md](./ATLAS_PLATFORM_V1.md) | Version 1 platform freeze |
| [ATLAS_AGENT_ARCHITECTURE.md](./ATLAS_AGENT_ARCHITECTURE.md) | Agent intelligence layer |
| [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md) | ADRs |
| [Communication_Hub.md](./Communication_Hub.md) | Transport layer (DOC-0010) |
| [atlas-communication-platform.md](./atlas-communication-platform.md) | Multichannel platform (DOC-0020) |
| [WORKFLOW_ENGINE_SPEC.md](./WORKFLOW_ENGINE_SPEC.md) | Workflow engine spec |
| [WORKFLOW_SEQUENCE_DIAGRAMS.md](./WORKFLOW_SEQUENCE_DIAGRAMS.md) | Sequence diagrams |
""",
    "03-engineering/README.md": """# Engineering documentation

| Document | Purpose |
|----------|---------|
| [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) | How Atlas evolves |
| [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) | Performance and quality targets |
| [WORKFLOW_SIMULATOR_SPEC.md](./WORKFLOW_SIMULATOR_SPEC.md) | Dev workflow simulator |
| [frontend/](./frontend/) | Frontend audits and UX debt |
""",
    "04-api/README.md": """# API documentation

| Document | Endpoint / scope |
|----------|------------------|
| [mission-control-workflow-advance.md](./mission-control-workflow-advance.md) | `POST /api/mission-control/:phone/workflow/advance` |
| [workflow-simulator-dev-api.md](./workflow-simulator-dev-api.md) | `/dev/workflow/*` dev simulator |
""",
    "05-integrations/README.md": """# Integrations documentation

| Document | Purpose |
|----------|---------|
| [WHATSAPP_EMBEDDED_SIGNUP.md](./WHATSAPP_EMBEDDED_SIGNUP.md) | Embedded Signup setup |
| [meta/](./meta/) | Meta Business Verification package |
""",
    "06-business/README.md": """# Business rules & domain model

| Document | Purpose |
|----------|---------|
| [BUSINESS_RULES.md](./BUSINESS_RULES.md) | Authoritative behavior contract (BR-001+) |
| [MILESTONE_DEFINITIONS.md](./MILESTONE_DEFINITIONS.md) | Workflow milestones |
| [EVENT_CATALOG.md](./EVENT_CATALOG.md) | Timeline event types |
| [ATLAS_GLOSSARY.md](./ATLAS_GLOSSARY.md) | Terminology |
""",
    "07-security/README.md": """# Security & compliance documentation

| Document | ID | Purpose |
|----------|-----|---------|
| [Privacy_and_Data_Handling.md](./Privacy_and_Data_Handling.md) | DOC-0003 | Privacy and data handling |
| [Meta_Review_QA.md](./Meta_Review_QA.md) | DOC-0004 | Meta reviewer Q&A |

Public pages: `/privacy`, `/terms`, `/legal`, `/data-deletion`
""",
    "08-operations/README.md": """# Operations documentation

| Document | Purpose |
|----------|---------|
| [local-development.md](./local-development.md) | Local dev troubleshooting |
| [deployment/](./deployment/) | Production deployment runbooks |
| [sprint-11.4-whatsapp-investigation.md](./sprint-11.4-whatsapp-investigation.md) | Strategic pivot (DOC-0513) |
""",
    "09-releases/README.md": """# Releases & sprints

| Document | Purpose |
|----------|---------|
| [CHANGELOG.md](./CHANGELOG.md) | Release changelog (DOC-0600) |
| [RELEASE_HISTORY.md](./RELEASE_HISTORY.md) | Version 1 release history |
| [sprints/](./sprints/) | Sprint specifications |
| [archive/v1-platform/](./archive/v1-platform/) | V1 platform Release 1.x docs |
""",
    "10-rfcs/README.md": None,  # already exists, skip overwrite
}

for rel, content in SECTION_READMES.items():
    if content is None:
        continue
    path = DOCS / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("readme", rel)
