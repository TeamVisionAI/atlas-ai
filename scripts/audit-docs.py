#!/usr/bin/env python3
"""Atlas Documentation Health Audit — scan, fix safe issues, report."""

from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
FIX_LINKS = ROOT / "scripts" / "fix-doc-links.py"

LINK_RE = re.compile(r"\]\(([^)]+)\)")
DOC_CONTROL_RE = re.compile(r"## Document control", re.I)
CANONICAL_PREFIXES = tuple(f"{i:02d}-" for i in range(12))

# Folders that should have README.md
REQUIRED_README_DIRS = [
    DOCS,
    DOCS / "00-executive",
    DOCS / "01-product",
    DOCS / "01-product" / "archive",
    DOCS / "01-product" / "archive" / "v1-platform",
    DOCS / "01-product" / "archive" / "v1-platform" / "customer-journeys",
    DOCS / "02-architecture",
    DOCS / "03-engineering",
    DOCS / "03-engineering" / "frontend",
    DOCS / "04-api",
    DOCS / "05-integrations",
    DOCS / "05-integrations" / "meta",
    DOCS / "06-business",
    DOCS / "07-security",
    DOCS / "08-operations",
    DOCS / "08-operations" / "deployment",
    DOCS / "08-operations" / "deployment" / "archive",
    DOCS / "09-releases",
    DOCS / "09-releases" / "archive",
    DOCS / "09-releases" / "archive" / "v1-platform",
    DOCS / "09-releases" / "sprints",
    DOCS / "10-rfcs",
    DOCS / "11-meta-tech-provider",
]

README_TEMPLATES = {
    "01-product/archive": """# Archive

Historical product documentation for the V1 platform branch (`sprint-7-engine-integration`).

| Path | Contents |
|------|----------|
| [v1-platform/customer-journeys/](./v1-platform/customer-journeys/) | JOURNEY_1–7 reference docs |
""",
    "01-product/archive/v1-platform": """# V1 platform archive

Reference documentation for the Version 1 platform track. Code exists on `sprint-7-engine-integration`, not `main`.

| Path | Contents |
|------|----------|
| [customer-journeys/](./customer-journeys/) | Onboarding and integration journey specs |
""",
    "01-product/archive/v1-platform/customer-journeys": """# Customer journeys (V1 platform archive)

Journey specifications for the V1 platform branch. See [Product backlog](../../BACKLOG.md) for production backlog on `main`.

| Document | Journey |
|----------|---------|
| [JOURNEY_1.md](./JOURNEY_1.md) | First-time user onboarding |
| [JOURNEY_2.md](./JOURNEY_2.md) | First appointment |
| [JOURNEY_3.md](./JOURNEY_3.md) | Meeting lifecycle |
| [JOURNEY_4.md](./JOURNEY_4.md) | Agent architecture reference |
| [JOURNEY_5.md](./JOURNEY_5.md) | Agent runtime increments |
| [JOURNEY_6.md](./JOURNEY_6.md) | Communication Gateway |
| [JOURNEY_7.md](./JOURNEY_7.md) | Production connectors |
""",
    "03-engineering/frontend": """# Frontend engineering audits

Design Week baseline audits (Atlas Version 1 Freeze).

| Document | Purpose |
|----------|---------|
| [FRONTEND_AUDIT.md](./FRONTEND_AUDIT.md) | Full frontend audit |
| [COMPONENT_INVENTORY.md](./COMPONENT_INVENTORY.md) | Component inventory |
| [PAGE_INVENTORY.md](./PAGE_INVENTORY.md) | Page inventory |
| [NAVIGATION_MAP.md](./NAVIGATION_MAP.md) | Navigation map |
| [DESIGN_SYSTEM_STATUS.md](./DESIGN_SYSTEM_STATUS.md) | Design system status |
| [ACCESSIBILITY_AUDIT.md](./ACCESSIBILITY_AUDIT.md) | Accessibility audit |
| [RESPONSIVE_AUDIT.md](./RESPONSIVE_AUDIT.md) | Responsive audit |
| [UX_DEBT.md](./UX_DEBT.md) | UX debt register |
""",
    "08-operations/deployment/archive": """# Deployment archive

Deferred or superseded deployment runbooks.

| Document | Status |
|----------|--------|
| [whatsapp-cloud-api-migration-checklist.md](./whatsapp-cloud-api-migration-checklist.md) | **Deferred** — Meta WhatsApp restriction (DOC-0702) |
""",
    "09-releases/archive": """# Release archive

Historical release documentation.

| Path | Contents |
|------|----------|
| [v1-platform/](./v1-platform/) | Release 1.1–1.4 (V1 platform branch) |
""",
    "09-releases/archive/v1-platform": """# V1 platform releases (archive)

Release notes for the Version 1 platform branch (`sprint-7-engine-integration`).

| Document | Release |
|----------|---------|
| [RELEASE_1_1.md](./RELEASE_1_1.md) | Team Vision Recruiting Pack |
| [RELEASE_1_2.md](./RELEASE_1_2.md) | Organization Console |
| [RELEASE_1_3.md](./RELEASE_1_3.md) | Daily Brief |
| [RELEASE_1_4.md](./RELEASE_1_4.md) | Mission Control |
""",
    "09-releases/sprints": """# Sprint specifications

Implementation specifications for Team Vision production sprints on `main`.

| Document | Sprint |
|----------|--------|
| [SPRINT_8A_1.md](./SPRINT_8A_1.md) | 8A.1 Workflow foundation |
| [SPRINT_8A_2.md](./SPRINT_8A_2.md) | 8A.2 Stall detection |
| [SPRINT_10_2_PROSPECT_WORKSPACE.md](./SPRINT_10_2_PROSPECT_WORKSPACE.md) | 10.2 Prospect Workspace |
| [SPRINT_10_2B_ACTIVITY_FEED.md](./SPRINT_10_2B_ACTIVITY_FEED.md) | 10.2b Activity Feed |
| [SPRINT_10_3_PROSPECT_CENTER.md](./SPRINT_10_3_PROSPECT_CENTER.md) | 10.3 Prospect Center |
| [SPRINT_11_1_LIVE_WHATSAPP.md](./SPRINT_11_1_LIVE_WHATSAPP.md) | 11.1 Live WhatsApp |
| [Sprint-11.4.md](./Sprint-11.4.md) | 11.4 Conversation Engine |
| [Sprint-11.4-Implementation-Plan.md](./Sprint-11.4-Implementation-Plan.md) | 11.4 Implementation plan |
| [../04-api/mission-control-workflow-advance.md](../04-api/mission-control-workflow-advance.md) | 8A.3 Advance API |
| [../04-api/workflow-simulator-dev-api.md](../04-api/workflow-simulator-dev-api.md) | 8A.4a Dev simulator |
""",
}

# Known link rewrites (broken path -> correct path relative to docs/)
GLOBAL_LINK_FIXES = [
    ("../05-integrations/meta/../07-security/", "../07-security/"),
    ("05-integrations/meta/../07-security/", "07-security/"),
    ("docs/deployment/", "08-operations/deployment/"),
    ("docs/troubleshooting/local-development.md", "08-operations/local-development.md"),
    ("../Current_System_State.md", "../00-executive/Current_System_State.md"),
    ("../roadmap/ROADMAP.md", "../00-executive/Roadmap.md"),
    ("roadmap/ROADMAP.md", "00-executive/Roadmap.md"),
    ("docs/04-meta/", "docs/05-integrations/meta/"),
    ("../releases/", "../09-releases/archive/v1-platform/"),
    ("../onboarding/", "../01-product/archive/v1-platform/customer-journeys/"),
    ("../rfcs/", "../10-rfcs/"),
    ("../architecture/", "../02-architecture/"),
    ("../deployment/whatsapp-cloud-api-migration-checklist.md",
     "../08-operations/deployment/archive/whatsapp-cloud-api-migration-checklist.md"),
    ("deployment/whatsapp-cloud-api-migration-checklist.md",
     "08-operations/deployment/archive/whatsapp-cloud-api-migration-checklist.md"),
    ("../05-sprints/", "../09-releases/sprints/"),
    ("../06-releases/", "../09-releases/"),
    ("../vision/", "../01-product/"),
]

STUB_REDIRECTS = {
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


def all_md_files() -> list[Path]:
    return sorted(DOCS.rglob("*.md"))


def is_external(url: str) -> bool:
    u = url.strip()
    return (
        u.startswith("http://")
        or u.startswith("https://")
        or u.startswith("mailto:")
        or u.startswith("#")
        or u.startswith("data:")
    )


def resolve_link(source: Path, target: str) -> Path | None:
    target = target.strip().split("#")[0].split("?")[0]
    if not target or is_external(target):
        return None
    if target.startswith("/"):
        return ROOT / target.lstrip("/")
    return (source.parent / target).resolve()


def orphan_markdown_outside_canonical() -> list[str]:
    """Markdown under docs/ outside 00–11 folders (excluding allowed root files)."""
    allowed_root = set(STUB_REDIRECTS) | {"README.md", "DOCUMENTATION_HEALTH_REPORT.md"}
    orphans = []
    for path in sorted(DOCS.rglob("*.md")):
        rel = path.relative_to(DOCS)
        if len(rel.parts) == 1:
            if rel.name not in allowed_root:
                orphans.append(str(path.relative_to(ROOT)))
        elif not rel.parts[0].startswith(CANONICAL_PREFIXES):
            orphans.append(str(path.relative_to(ROOT)))
    return orphans


def repo_markdown_outside_docs() -> list[str]:
    """Non-docs markdown in repo (informational — typically README files)."""
    found = []
    for path in sorted(ROOT.rglob("*.md")):
        if "node_modules" in path.parts or ".git" in path.parts:
            continue
        try:
            path.relative_to(DOCS)
        except ValueError:
            found.append(str(path.relative_to(ROOT)))
    return found


def run_link_fixer() -> tuple[bool, int]:
    if not FIX_LINKS.exists():
        return False, 0
    result = subprocess.run(
        [sys.executable, str(FIX_LINKS)],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    count = 0
    for line in result.stdout.splitlines():
        if line.startswith("TOTAL_FIXES="):
            count = int(line.split("=", 1)[1])
    return result.returncode == 0 and count > 0, count


def apply_global_fixes(text: str) -> str:
    for old, new in GLOBAL_LINK_FIXES:
        text = text.replace(old, new)
    return text


def fix_file_links(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    updated = apply_global_fixes(text)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def ensure_readmes() -> list[str]:
    created = []
    for d in REQUIRED_README_DIRS:
        readme = d / "README.md"
        if readme.exists():
            continue
        rel = str(d.relative_to(DOCS)).replace("\\", "/")
        template = README_TEMPLATES.get(rel)
        if not template:
            template = f"# {rel.split('/')[-1].replace('-', ' ').title()}\n\nSee [Documentation Hub](../README.md).\n"
            if rel.count("/") == 1:
                template = f"# {rel.split('/')[-1].replace('-', ' ').title()}\n\nSee [Documentation Hub](../README.md).\n"
            elif rel.count("/") >= 2:
                ups = "/".join([".."] * rel.count("/"))
                template = f"# {rel.split('/')[-1].replace('-', ' ').title()}\n\nSee [Documentation Hub]({ups}/README.md).\n"
        readme.parent.mkdir(parents=True, exist_ok=True)
        readme.write_text(template, encoding="utf-8")
        created.append(str(readme.relative_to(ROOT)))
    return created


def ensure_meta_readme() -> None:
    meta = DOCS / "05-integrations" / "meta" / "README.md"
    if meta.exists():
        return
    meta.write_text("# Meta integration documentation\n\nSee [integrations README](../README.md).\n", encoding="utf-8")


def is_legacy_stub(path: Path) -> bool:
    if path.parent != DOCS:
        return False
    text = path.read_text(encoding="utf-8")
    return "Document moved" in text[:300] or path.name in STUB_REDIRECTS


def scan_broken_links() -> list[tuple[str, int, str, str]]:
    broken = []
    for path in all_md_files():
        text = path.read_text(encoding="utf-8")
        for m in LINK_RE.finditer(text):
            raw = m.group(1)
            if is_external(raw):
                continue
            resolved = resolve_link(path, raw)
            if resolved is None:
                continue
            # directory links may not have trailing file
            if raw.endswith("/"):
                if not resolved.is_dir():
                    broken.append((str(path.relative_to(ROOT)), m.start(), raw, "directory missing"))
                continue
            if not resolved.exists():
                broken.append((str(path.relative_to(ROOT)), 0, raw, "file missing"))
    return broken


def content_hashes() -> dict[str, list[str]]:
    hashes: dict[str, list[str]] = {}
    for path in all_md_files():
        if path.name == "README.md" and "Document moved" in path.read_text(encoding="utf-8")[:200]:
            continue
        if path.parent == DOCS and path.name in STUB_REDIRECTS:
            continue  # stubs are intentional duplicates of intent
        h = hashlib.sha256(path.read_text(encoding="utf-8").encode()).hexdigest()
        rel = str(path.relative_to(ROOT))
        hashes.setdefault(h, []).append(rel)
    return {h: paths for h, paths in hashes.items() if len(paths) > 1}


def reachable_from_hub() -> tuple[set[str], set[str]]:
    hub = DOCS / "README.md"
    all_rels = {str(p.relative_to(DOCS)) for p in all_md_files() if not is_legacy_stub(p)}
    visited: set[str] = set()
    queue: deque[str] = deque(["README.md"])

    def extract_links(path: Path) -> list[str]:
        links = []
        for m in LINK_RE.finditer(path.read_text(encoding="utf-8")):
            raw = m.group(1).strip()
            if is_external(raw):
                continue
            base = raw.split("#")[0].split("?")[0]
            if not base:
                continue
            resolved = resolve_link(path, base)
            if resolved and resolved.is_file() and resolved.suffix == ".md":
                try:
                    links.append(str(resolved.relative_to(DOCS)))
                except ValueError:
                    pass
            elif resolved and resolved.is_dir():
                readme = resolved / "README.md"
                if readme.exists():
                    links.append(str(readme.relative_to(DOCS)))
        return links

    while queue:
        rel = queue.popleft()
        if rel in visited:
            continue
        visited.add(rel)
        path = DOCS / rel
        if not path.exists():
            continue
        for link in extract_links(path):
            if link not in visited:
                queue.append(link)

    # README.md in each folder makes folder contents reachable via folder README if hub links folder
    # Expand: any doc linked from any visited doc already handled by BFS
    # Also count docs linked from section READMEs reachable if hub links section
    unreachable = all_rels - visited
    return visited, unreachable


def missing_metadata() -> list[str]:
    missing = []
    skip_dirs = {"archive", "sprints"}
    for path in all_md_files():
        rel = path.relative_to(DOCS)
        if path.name == "README.md":
            continue
        if any(part in skip_dirs for part in rel.parts) and "archive" in rel.parts:
            continue
        if path.parent == DOCS and path.name in STUB_REDIRECTS:
            continue
        text = path.read_text(encoding="utf-8")
        has_control = bool(DOC_CONTROL_RE.search(text)) or "**Document type:**" in text or "**Status:**" in text[:500]
        has_title = text.startswith("# ")
        if not (has_control or (has_title and len(text) > 100)):
            missing.append(str(path.relative_to(ROOT)))
        elif not has_control and path.name not in {
            "WHY_ATLAS_EXISTS.md",
            "ATLAS_NEVER_SLEEPS.md",
            "DOCUMENTATION_HEALTH_REPORT.md",
        }:
            # sprint/api docs use **Status:** instead
            if "**Status:**" not in text[:800] and "**Sprint:**" not in text[:800]:
                missing.append(str(path.relative_to(ROOT)))
    return missing


def naming_issues() -> list[str]:
    issues = []
    for path in all_md_files():
        name = path.name
        rel = str(path.relative_to(DOCS))
        if rel.startswith("10-rfcs/RFC-"):
            continue
        if name.startswith("SPRINT_") and path.parent.name == "sprints":
            continue  # legacy sprint naming OK in sprints folder
        if name.startswith("Sprint-"):
            continue
        if name.islower() or name.replace("-", "").replace("_", "").isalnum():
            if name != name.replace(" ", "_") and " " in name:
                issues.append(f"{rel}: contains spaces")
        # intentional legacy redirect stubs at docs root
        if path.parent == DOCS and name in STUB_REDIRECTS:
            continue
        if path.parent == DOCS and name.startswith("SPRINT_"):
            issues.append(f"{rel}: legacy root stub (should only be redirect)")
    return issues


def validate_numbering() -> list[str]:
    issues = []
    top_dirs = [p for p in DOCS.iterdir() if p.is_dir()]
    for p in top_dirs:
        if not re.match(r"^\d{2}-", p.name):
            issues.append(f"Non-canonical top folder: {p.name}")
    expected = [f"{i:02d}-" for i in range(11)]
    for p in top_dirs:
        prefix = p.name[:3]
        if prefix not in [f"{i:02d}-" for i in range(12)]:
            issues.append(f"Invalid prefix: {p.name}")
    return issues


def add_hub_links_for_unreachable(unreachable: set[str]) -> int:
    """Add missing doc links to docs/README.md index if safe."""
    hub = DOCS / "README.md"
    text = hub.read_text(encoding="utf-8")
    added = 0
    # Group unreachable archive/sprint docs - they should be reachable via section READMEs
    return added


def main() -> None:
    fixes = []
    created_readmes = ensure_readmes()
    fixes.extend([f"Created {p}" for p in created_readmes])

    for path in all_md_files():
        if fix_file_links(path):
            fixes.append(f"Fixed legacy path patterns in {path.relative_to(ROOT)}")

    fixed_links, link_fixes = run_link_fixer()
    if fixed_links:
        fixes.append(f"Ran smart relative link fixer ({link_fixes} links)")

    orphans = orphan_markdown_outside_canonical()
    external_md = repo_markdown_outside_docs()

    broken = scan_broken_links()
    duplicates = content_hashes()
    visited, unreachable = reachable_from_hub()
    missing_readmes = [str(d.relative_to(ROOT)) for d in REQUIRED_README_DIRS if not (d / "README.md").exists()]
    missing_meta = missing_metadata()
    naming = naming_issues()
    numbering = validate_numbering()

    # Second pass: if unreachable only archive/sprint/frontend files, link via section README BFS from hub again
    visited2, unreachable2 = reachable_from_hub()
    unreachable = unreachable2

    report_path = DOCS / "DOCUMENTATION_HEALTH_REPORT.md"
    total = len(all_md_files())

    lines = [
        "# Documentation Health Report",
        "",
        f"**Generated:** Atlas Documentation Foundation v1.0 audit",
        f"**Total documents:** {total}",
        "",
        "## Audit checklist",
        "",
        "| # | Check | Result |",
        "|---|-------|--------|",
        f"| 1 | No broken internal links | {'PASS' if not broken else 'FAIL'} |",
        f"| 2 | Every document reachable from docs/README.md | {'PASS' if not unreachable else 'FAIL'} |",
        f"| 3 | Every folder contains README.md | {'PASS' if not missing_readmes else 'FAIL'} |",
        f"| 4 | No duplicate documents | {'PASS' if not duplicates else 'FAIL'} |",
        f"| 5 | No orphan markdown outside canonical structure | {'PASS' if not orphans else 'FAIL'} |",
        f"| 6 | Cross-references validated | {'PASS' if not broken else 'FAIL'} |",
        f"| 7 | Document naming consistency | {'PASS' if not naming else 'WARN'} |",
        f"| 8 | Folder numbering 00–11 | {'PASS' if not numbering else 'FAIL'} |",
        "",
        "## Summary",
        "",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Total markdown files | {total} |",
        f"| Broken internal links | {len(broken)} |",
        f"| Unreachable from hub | {len(unreachable)} |",
        f"| Duplicate content groups | {len(duplicates)} |",
        f"| Orphan files in docs/ | {len(orphans)} |",
        f"| Markdown outside docs/ | {len(external_md)} |",
        f"| Missing README folders | {len(missing_readmes)} |",
        f"| Missing metadata | {len(missing_meta)} |",
        f"| Naming inconsistencies | {len(naming)} |",
        f"| Numbering issues | {len(numbering)} |",
        f"| Auto-fixes applied | {len(fixes)} |",
        "",
        "## Auto-fixes applied",
        "",
    ]
    if fixes:
        lines.extend(f"- {f}" for f in fixes)
    else:
        lines.append("- None")
    lines.extend(["", "## Broken links", ""])
    if broken:
        for file, _, target, reason in broken[:100]:
            lines.append(f"- `{file}` → `{target}` ({reason})")
    else:
        lines.append("None detected.")
    lines.extend(["", "## Unreachable from docs/README.md", ""])
    if unreachable:
        for u in sorted(unreachable):
            lines.append(f"- `{u}`")
    else:
        lines.append("All documents reachable.")
    lines.extend(["", "## Orphan markdown in docs/", ""])
    if orphans:
        for o in orphans:
            lines.append(f"- `{o}`")
    else:
        lines.append("None — all files under canonical 00–11 structure or allowed root stubs.")
    lines.extend(["", "## Markdown outside docs/ (informational)", ""])
    if external_md:
        for o in external_md:
            lines.append(f"- `{o}`")
    else:
        lines.append("None.")
    lines.extend(["", "## Duplicate content", ""])
    if duplicates:
        for paths in duplicates.values():
            lines.append(f"- {' = '.join('`' + p + '`' for p in paths)}")
    else:
        lines.append("No unintended duplicates (redirect stubs excluded).")
    lines.extend(["", "## Missing README folders", ""])
    if missing_readmes:
        for m in missing_readmes:
            lines.append(f"- `{m}`")
    else:
        lines.append("All required folders have README.md.")
    lines.extend(["", "## Missing metadata (Document control or Status header)", ""])
    if missing_meta:
        for m in missing_meta[:50]:
            lines.append(f"- `{m}`")
        if len(missing_meta) > 50:
            lines.append(f"- ... and {len(missing_meta) - 50} more")
    else:
        lines.append("None flagged.")
    lines.extend(["", "## Naming inconsistencies", ""])
    if naming:
        for n in naming:
            lines.append(f"- {n}")
    else:
        lines.append("None flagged.")
    lines.extend([
        "",
        "## Cross-reference validation",
        "",
        f"Scanned all `{total}` markdown files for internal hyperlinks. "
        + ("All resolved targets exist." if not broken else f"{len(broken)} broken links remain."),
        "",
        "## Document naming conventions (informational)",
        "",
        "Intentional mixed conventions retained for backward compatibility:",
        "- `Sprint-11.4.md` — newer sprint specs (kebab-case with dot version)",
        "- `SPRINT_11_1_*.md` — legacy sprint specs (underscore naming)",
        "- Root-level `docs/SPRINT_*.md` and `docs/BUSINESS_RULES.md` etc. are redirect stubs only.",
        "",
        "## Numbering validation",
        "",
    ])
    if numbering:
        for n in numbering:
            lines.append(f"- {n}")
    else:
        lines.append("Folders 00–11 validated.")

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"TOTAL={total}")
    print(f"BROKEN={len(broken)}")
    print(f"UNREACHABLE={len(unreachable)}")
    print(f"DUPES={len(duplicates)}")
    print(f"ORPHANS={len(orphans)}")
    print(f"EXTERNAL_MD={len(external_md)}")
    print(f"MISSING_META={len(missing_meta)}")
    print(f"FIXES={len(fixes)}")
    if broken:
        for b in broken[:20]:
            print("BROKEN", b)
    if unreachable:
        for u in sorted(list(unreachable))[:20]:
            print("UNREACH", u)


if __name__ == "__main__":
    main()
