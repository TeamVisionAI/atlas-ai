#!/usr/bin/env python3
"""Atlas Documentation Foundation v1.0 — one-time consolidation helper."""

from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

# (source relative to docs/, destination relative to docs/)
MOVES: list[tuple[str, str]] = [
    ("ATLAS_CORE_ARCHITECTURE.md", "02-architecture/ATLAS_CORE_ARCHITECTURE.md"),
    ("architecture/atlas-communication-platform.md", "02-architecture/atlas-communication-platform.md"),
    ("architecture/ATLAS_PLATFORM_V1.md", "02-architecture/ATLAS_PLATFORM_V1.md"),
    ("architecture/ATLAS_AGENT_ARCHITECTURE.md", "02-architecture/ATLAS_AGENT_ARCHITECTURE.md"),
    ("architecture/ARCHITECTURE_DECISIONS.md", "02-architecture/ARCHITECTURE_DECISIONS.md"),
    ("02-architecture/Communication_Hub.md", "02-architecture/Communication_Hub.md"),
    ("WORKFLOW_ENGINE_SPEC.md", "02-architecture/WORKFLOW_ENGINE_SPEC.md"),
    ("WORKFLOW_SEQUENCE_DIAGRAMS.md", "02-architecture/WORKFLOW_SEQUENCE_DIAGRAMS.md"),
    ("DEVELOPMENT_WORKFLOW.md", "03-engineering/DEVELOPMENT_WORKFLOW.md"),
    ("ENGINEERING_STANDARDS.md", "03-engineering/ENGINEERING_STANDARDS.md"),
    ("WORKFLOW_SIMULATOR_SPEC.md", "03-engineering/WORKFLOW_SIMULATOR_SPEC.md"),
    ("troubleshooting/local-development.md", "08-operations/local-development.md"),
    ("SPRINT_8A_3.md", "04-api/mission-control-workflow-advance.md"),
    ("SPRINT_8A_4a.md", "04-api/workflow-simulator-dev-api.md"),
    ("WHATSAPP_EMBEDDED_SIGNUP.md", "05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md"),
    ("04-meta/Meta_Approval_Portfolio.md", "05-integrations/meta/Meta_Approval_Portfolio.md"),
    ("04-meta/README.md", "05-integrations/meta/README.md"),
    ("04-meta/Privacy_and_Data_Handling.md", "07-security/Privacy_and_Data_Handling.md"),
    ("04-meta/Meta_Review_QA.md", "07-security/Meta_Review_QA.md"),
    ("BUSINESS_RULES.md", "06-business/BUSINESS_RULES.md"),
    ("ATLAS_GLOSSARY.md", "06-business/ATLAS_GLOSSARY.md"),
    ("MILESTONE_DEFINITIONS.md", "06-business/MILESTONE_DEFINITIONS.md"),
    ("EVENT_CATALOG.md", "06-business/EVENT_CATALOG.md"),
    ("BACKLOG.md", "01-product/BACKLOG.md"),
    ("vision/WHY_ATLAS_EXISTS.md", "01-product/WHY_ATLAS_EXISTS.md"),
    ("vision/ATLAS_NEVER_SLEEPS.md", "01-product/ATLAS_NEVER_SLEEPS.md"),
    ("06-releases/CHANGELOG.md", "09-releases/CHANGELOG.md"),
    ("releases/RELEASE_HISTORY.md", "09-releases/RELEASE_HISTORY.md"),
    ("deployment/README.md", "08-operations/deployment/README.md"),
    ("deployment/sprint-11.4-meta-production.md", "08-operations/deployment/sprint-11.4-meta-production.md"),
    ("deployment/whatsapp-cloud-api-migration-checklist.md", "08-operations/deployment/archive/whatsapp-cloud-api-migration-checklist.md"),
    ("sprints/sprint-11.4-whatsapp-investigation.md", "08-operations/sprint-11.4-whatsapp-investigation.md"),
    ("05-sprints/Sprint-11.4.md", "09-releases/sprints/Sprint-11.4.md"),
    ("05-sprints/Sprint-11.4-Implementation-Plan.md", "09-releases/sprints/Sprint-11.4-Implementation-Plan.md"),
    ("SPRINT_8A_1.md", "09-releases/sprints/SPRINT_8A_1.md"),
    ("SPRINT_8A_2.md", "09-releases/sprints/SPRINT_8A_2.md"),
    ("SPRINT_10_2_PROSPECT_WORKSPACE.md", "09-releases/sprints/SPRINT_10_2_PROSPECT_WORKSPACE.md"),
    ("SPRINT_10_2B_ACTIVITY_FEED.md", "09-releases/sprints/SPRINT_10_2B_ACTIVITY_FEED.md"),
    ("SPRINT_10_3_PROSPECT_CENTER.md", "09-releases/sprints/SPRINT_10_3_PROSPECT_CENTER.md"),
    ("SPRINT_11_1_LIVE_WHATSAPP.md", "09-releases/sprints/SPRINT_11_1_LIVE_WHATSAPP.md"),
    ("releases/RELEASE_1_1.md", "09-releases/archive/v1-platform/RELEASE_1_1.md"),
    ("releases/RELEASE_1_2.md", "09-releases/archive/v1-platform/RELEASE_1_2.md"),
    ("releases/RELEASE_1_3.md", "09-releases/archive/v1-platform/RELEASE_1_3.md"),
    ("releases/RELEASE_1_4.md", "09-releases/archive/v1-platform/RELEASE_1_4.md"),
    ("onboarding/JOURNEY_1.md", "01-product/archive/v1-platform/customer-journeys/JOURNEY_1.md"),
    ("onboarding/JOURNEY_2.md", "01-product/archive/v1-platform/customer-journeys/JOURNEY_2.md"),
    ("onboarding/JOURNEY_3.md", "01-product/archive/v1-platform/customer-journeys/JOURNEY_3.md"),
    ("onboarding/JOURNEY_4.md", "01-product/archive/v1-platform/customer-journeys/JOURNEY_4.md"),
    ("onboarding/JOURNEY_5.md", "01-product/archive/v1-platform/customer-journeys/JOURNEY_5.md"),
    ("onboarding/JOURNEY_6.md", "01-product/archive/v1-platform/customer-journeys/JOURNEY_6.md"),
    ("onboarding/JOURNEY_7.md", "01-product/archive/v1-platform/customer-journeys/JOURNEY_7.md"),
    ("rfcs/README.md", "10-rfcs/README.md"),
    ("rfcs/RFC-001-message-envelope.md", "10-rfcs/RFC-001-message-envelope.md"),
    ("rfcs/RFC-002-event-naming.md", "10-rfcs/RFC-002-event-naming.md"),
    ("rfcs/RFC-003-tool-contract.md", "10-rfcs/RFC-003-tool-contract.md"),
    ("rfcs/RFC-004-workflow-contract.md", "10-rfcs/RFC-004-workflow-contract.md"),
    ("rfcs/RFC-005-package-manifest.md", "10-rfcs/RFC-005-package-manifest.md"),
    ("rfcs/RFC-006-organization-model.md", "10-rfcs/RFC-006-organization-model.md"),
    ("rfcs/RFC-007-connector-contract.md", "10-rfcs/RFC-007-connector-contract.md"),
    ("rfcs/RFC-008-daily-brief-schema.md", "10-rfcs/RFC-008-daily-brief-schema.md"),
    ("rfcs/RFC-009-mission-control-state.md", "10-rfcs/RFC-009-mission-control-state.md"),
    ("rfcs/RFC-010-event-bus-principles.md", "10-rfcs/RFC-010-event-bus-principles.md"),
]

FRONTEND_AUDITS = [
    "ACCESSIBILITY_AUDIT.md",
    "COMPONENT_INVENTORY.md",
    "DESIGN_SYSTEM_STATUS.md",
    "FRONTEND_AUDIT.md",
    "NAVIGATION_MAP.md",
    "PAGE_INVENTORY.md",
    "RESPONSIVE_AUDIT.md",
    "UX_DEBT.md",
]

for name in FRONTEND_AUDITS:
    MOVES.append((f"frontend/{name}", f"03-engineering/frontend/{name}"))

# Link replacement patterns: (old, new) — applied to all markdown under docs/ and key refs
LINK_REPLACEMENTS: list[tuple[str, str]] = [
    ("docs/BUSINESS_RULES.md", "docs/06-business/BUSINESS_RULES.md"),
    ("./BUSINESS_RULES.md", "../06-business/BUSINESS_RULES.md"),
    ("../BUSINESS_RULES.md", "../06-business/BUSINESS_RULES.md"),
    ("[BUSINESS_RULES.md](./BUSINESS_RULES.md)", "[BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md)"),
    ("[BUSINESS_RULES.md](../BUSINESS_RULES.md)", "[BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md)"),
    ("docs/DEVELOPMENT_WORKFLOW.md", "docs/03-engineering/DEVELOPMENT_WORKFLOW.md"),
    ("./DEVELOPMENT_WORKFLOW.md", "../03-engineering/DEVELOPMENT_WORKFLOW.md"),
    ("../DEVELOPMENT_WORKFLOW.md", "../03-engineering/DEVELOPMENT_WORKFLOW.md"),
    ("docs/ENGINEERING_STANDARDS.md", "docs/03-engineering/ENGINEERING_STANDARDS.md"),
    ("./ENGINEERING_STANDARDS.md", "../03-engineering/ENGINEERING_STANDARDS.md"),
    ("../ENGINEERING_STANDARDS.md", "../03-engineering/ENGINEERING_STANDARDS.md"),
    ("docs/ATLAS_GLOSSARY.md", "docs/06-business/ATLAS_GLOSSARY.md"),
    ("./ATLAS_GLOSSARY.md", "../06-business/ATLAS_GLOSSARY.md"),
    ("../ATLAS_GLOSSARY.md", "../06-business/ATLAS_GLOSSARY.md"),
    ("docs/ATLAS_CORE_ARCHITECTURE.md", "docs/02-architecture/ATLAS_CORE_ARCHITECTURE.md"),
    ("./ATLAS_CORE_ARCHITECTURE.md", "../02-architecture/ATLAS_CORE_ARCHITECTURE.md"),
    ("../ATLAS_CORE_ARCHITECTURE.md", "../02-architecture/ATLAS_CORE_ARCHITECTURE.md"),
    ("docs/EVENT_CATALOG.md", "docs/06-business/EVENT_CATALOG.md"),
    ("./EVENT_CATALOG.md", "../06-business/EVENT_CATALOG.md"),
    ("../EVENT_CATALOG.md", "../06-business/EVENT_CATALOG.md"),
    ("docs/MILESTONE_DEFINITIONS.md", "docs/06-business/MILESTONE_DEFINITIONS.md"),
    ("./MILESTONE_DEFINITIONS.md", "../06-business/MILESTONE_DEFINITIONS.md"),
    ("../MILESTONE_DEFINITIONS.md", "../06-business/MILESTONE_DEFINITIONS.md"),
    ("docs/WORKFLOW_ENGINE_SPEC.md", "docs/02-architecture/WORKFLOW_ENGINE_SPEC.md"),
    ("./WORKFLOW_ENGINE_SPEC.md", "../02-architecture/WORKFLOW_ENGINE_SPEC.md"),
    ("../WORKFLOW_ENGINE_SPEC.md", "../02-architecture/WORKFLOW_ENGINE_SPEC.md"),
    ("docs/WORKFLOW_SEQUENCE_DIAGRAMS.md", "docs/02-architecture/WORKFLOW_SEQUENCE_DIAGRAMS.md"),
    ("./WORKFLOW_SEQUENCE_DIAGRAMS.md", "../02-architecture/WORKFLOW_SEQUENCE_DIAGRAMS.md"),
    ("../WORKFLOW_SEQUENCE_DIAGRAMS.md", "../02-architecture/WORKFLOW_SEQUENCE_DIAGRAMS.md"),
    ("docs/WORKFLOW_SIMULATOR_SPEC.md", "docs/03-engineering/WORKFLOW_SIMULATOR_SPEC.md"),
    ("./WORKFLOW_SIMULATOR_SPEC.md", "../03-engineering/WORKFLOW_SIMULATOR_SPEC.md"),
    ("../WORKFLOW_SIMULATOR_SPEC.md", "../03-engineering/WORKFLOW_SIMULATOR_SPEC.md"),
    ("docs/BACKLOG.md", "docs/01-product/BACKLOG.md"),
    ("./BACKLOG.md", "../01-product/BACKLOG.md"),
    ("../BACKLOG.md", "../01-product/BACKLOG.md"),
    ("docs/WHATSAPP_EMBEDDED_SIGNUP.md", "docs/05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md"),
    ("./WHATSAPP_EMBEDDED_SIGNUP.md", "../05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md"),
    ("../WHATSAPP_EMBEDDED_SIGNUP.md", "../05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md"),
    ("../04-meta/", "../05-integrations/meta/"),
    ("./04-meta/", "./05-integrations/meta/"),
    ("docs/04-meta/", "docs/05-integrations/meta/"),
    ("../architecture/", "../02-architecture/"),
    ("./architecture/", "./02-architecture/"),
    ("docs/architecture/", "docs/02-architecture/"),
    ("../releases/", "../09-releases/"),
    ("./releases/", "./09-releases/"),
    ("../rfcs/", "../10-rfcs/"),
    ("./rfcs/", "./10-rfcs/"),
    ("../vision/WHY_ATLAS_EXISTS.md", "../01-product/WHY_ATLAS_EXISTS.md"),
    ("../vision/ATLAS_NEVER_SLEEPS.md", "../01-product/ATLAS_NEVER_SLEEPS.md"),
    ("../roadmap/ROADMAP.md", "../00-executive/Roadmap.md"),
    ("../06-releases/CHANGELOG.md", "../09-releases/CHANGELOG.md"),
    ("../05-sprints/", "../09-releases/sprints/"),
    ("../deployment/", "../08-operations/deployment/"),
    ("../sprints/sprint-11.4-whatsapp-investigation.md", "../08-operations/sprint-11.4-whatsapp-investigation.md"),
    ("../troubleshooting/local-development.md", "../08-operations/local-development.md"),
    ("docs/SPRINT_8A_3.md", "docs/04-api/mission-control-workflow-advance.md"),
    ("./SPRINT_8A_3.md", "../04-api/mission-control-workflow-advance.md"),
    ("../SPRINT_8A_3.md", "../04-api/mission-control-workflow-advance.md"),
    ("docs/SPRINT_8A_4a.md", "docs/04-api/workflow-simulator-dev-api.md"),
    ("./SPRINT_8A_4a.md", "../04-api/workflow-simulator-dev-api.md"),
    ("../SPRINT_8A_4a.md", "../04-api/workflow-simulator-dev-api.md"),
    ("SPRINT_10_2_PROSPECT_WORKSPACE.md", "09-releases/sprints/SPRINT_10_2_PROSPECT_WORKSPACE.md"),
    ("SPRINT_10_2B_ACTIVITY_FEED.md", "09-releases/sprints/SPRINT_10_2B_ACTIVITY_FEED.md"),
    ("SPRINT_10_3_PROSPECT_CENTER.md", "09-releases/sprints/SPRINT_10_3_PROSPECT_CENTER.md"),
    ("SPRINT_11_1_LIVE_WHATSAPP.md", "09-releases/sprints/SPRINT_11_1_LIVE_WHATSAPP.md"),
    ("SPRINT_8A_1.md", "09-releases/sprints/SPRINT_8A_1.md"),
    ("SPRINT_8A_2.md", "09-releases/sprints/SPRINT_8A_2.md"),
    ("Sprint-11.4.md", "09-releases/sprints/Sprint-11.4.md"),
    ("Sprint-11.4-Implementation-Plan.md", "09-releases/sprints/Sprint-11.4-Implementation-Plan.md"),
    ("Meta_Approval_Portfolio.md", "05-integrations/meta/Meta_Approval_Portfolio.md"),
    ("Privacy_and_Data_Handling.md", "07-security/Privacy_and_Data_Handling.md"),
    ("Meta_Review_QA.md", "07-security/Meta_Review_QA.md"),
    ("atlas-communication-platform.md", "02-architecture/atlas-communication-platform.md"),
    ("ATLAS_PLATFORM_V1.md", "02-architecture/ATLAS_PLATFORM_V1.md"),
    ("ATLAS_AGENT_ARCHITECTURE.md", "02-architecture/ATLAS_AGENT_ARCHITECTURE.md"),
    ("ARCHITECTURE_DECISIONS.md", "02-architecture/ARCHITECTURE_DECISIONS.md"),
    ("RELEASE_HISTORY.md", "09-releases/RELEASE_HISTORY.md"),
    ("Current_System_State.md", "00-executive/Current_System_State.md"),
    ("Roadmap.md", "00-executive/Roadmap.md"),
    ("onboarding/JOURNEY_", "01-product/archive/v1-platform/customer-journeys/JOURNEY_"),
    ("releases/RELEASE_1_", "09-releases/archive/v1-platform/RELEASE_1_"),
]


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def move_file(src_rel: str, dst_rel: str) -> None:
    src = DOCS / src_rel
    dst = DOCS / dst_rel
    if not src.exists():
        return
    if src.resolve() == dst.resolve():
        return
    ensure_parent(dst)
    if dst.exists():
        dst.unlink()
    shutil.move(str(src), str(dst))
    print(f"MOVED {src_rel} -> {dst_rel}")


def apply_link_updates(content: str) -> str:
    for old, new in LINK_REPLACEMENTS:
        content = content.replace(old, new)
    return content


def update_all_links() -> None:
    targets = list(DOCS.rglob("*.md")) + [
        ROOT / ".cursor/rules/atlas-business-rules-workflow.mdc",
        ROOT / "README.md",
    ]
    for path in targets:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        updated = apply_link_updates(text)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            print(f"LINKS {path.relative_to(ROOT)}")


def remove_empty_dirs(base: Path) -> None:
    for dirpath, dirnames, filenames in os.walk(base, topdown=False):
        p = Path(dirpath)
        if p == base:
            continue
        if not any(p.iterdir()):
            p.rmdir()
            print(f"RMDIR {p.relative_to(ROOT)}")


def main() -> None:
    for src, dst in MOVES:
        move_file(src, dst)
    update_all_links()
    remove_empty_dirs(DOCS)


if __name__ == "__main__":
    main()
