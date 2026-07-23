#!/usr/bin/env python3
"""Fix broken relative markdown links under docs/ by resolving to canonical targets."""

from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

LINK_RE = re.compile(r"(\]\()([^)]+)(\))")
CANONICAL_PREFIXES = tuple(f"{i:02d}-" for i in range(11))

# Build lookup: basename -> list of paths under docs; path suffix -> path
_by_name: dict[str, list[Path]] = {}
_by_suffix: dict[str, Path] = {}


def _register(path: Path) -> None:
    rel = path.relative_to(DOCS)
    rel_str = str(rel).replace("\\", "/")
    _by_name.setdefault(path.name, []).append(path)
    parts = rel_str.split("/")
    for i in range(len(parts)):
        suffix = "/".join(parts[i:])
        if suffix not in _by_suffix or len(rel_str) < len(str(_by_suffix[suffix].relative_to(DOCS))):
            _by_suffix[suffix] = path


def _build_index() -> None:
    _by_name.clear()
    _by_suffix.clear()
    for path in DOCS.rglob("*.md"):
        _register(path)
    # Also register directories that have README.md
    for path in DOCS.rglob("README.md"):
        _register(path.parent / "")  # noqa — we handle dirs separately


def is_external(url: str) -> bool:
    u = url.strip()
    return u.startswith(("http://", "https://", "mailto:", "#", "data:"))


def resolve_raw(source: Path, target: str) -> Path | None:
    base = target.strip().split("#")[0].split("?")[0]
    if not base or is_external(base):
        return None
    if base.startswith("/"):
        return ROOT / base.lstrip("/")
    return (source.parent / base).resolve()


def rel_link(source: Path, target: Path) -> str:
    return os.path.relpath(target, source.parent).replace("\\", "/")


def find_canonical_target(link: str) -> Path | None:
    """Find a file under docs/ matching a broken link intent."""
    base = link.split("#")[0].split("?")[0].strip()
    if not base or is_external(base):
        return None

    # Normalize path-like strings: strip leading ./ and collapse .../
    cleaned = base.replace("\\", "/")
    cleaned = re.sub(r"(?:\.\./|\./|\.../)+", "", cleaned)  # strip relative noise
    cleaned = cleaned.lstrip("/")

    if cleaned.endswith("/"):
        cleaned = cleaned.rstrip("/")

    # Direct suffix match (e.g. 02-architecture/Foo.md)
    if cleaned in _by_suffix:
        return _by_suffix[cleaned]

    name = Path(cleaned).name
    if not name:
        return None

    candidates = _by_name.get(name, [])
    if len(candidates) == 1:
        return candidates[0]

    # Prefer match on longest common path suffix
    parts = [p for p in cleaned.split("/") if p]
    best: Path | None = None
    best_score = -1
    for cand in candidates:
        cand_parts = cand.relative_to(DOCS).parts
        score = 0
        for a, b in zip(reversed(parts), reversed(cand_parts)):
            if a != b:
                break
            score += 1
        if score > best_score:
            best_score = score
            best = cand
    return best


def find_canonical_dir(link: str) -> Path | None:
    base = link.rstrip("/").split("#")[0]
    cleaned = re.sub(r"(?:\.\./|\./|\.../)+", "", base.replace("\\", "/")).lstrip("/")
    if not cleaned:
        return None
    candidate = DOCS / cleaned
    if candidate.is_dir():
        return candidate
    # Match numbered folder suffix
    for d in DOCS.rglob("*"):
        if d.is_dir() and str(d.relative_to(DOCS)).replace("\\", "/") == cleaned:
            return d
    return None


def fix_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    changes = 0

    def replacer(m: re.Match[str]) -> str:
        nonlocal changes
        prefix, url, suffix = m.group(1), m.group(2), m.group(3)
        if is_external(url):
            return m.group(0)

        resolved = resolve_raw(path, url)
        if resolved and (resolved.exists() or (url.rstrip().endswith("/") and resolved.is_dir())):
            return m.group(0)

        anchor = ""
        if "#" in url:
            anchor = "#" + url.split("#", 1)[1]
        query = ""
        if "?" in url.split("#")[0]:
            base_part, query = url.split("?", 1)
            query = "?" + query.split("#")[0]
            url_for_lookup = base_part
        else:
            url_for_lookup = url.split("#")[0]

        if url.rstrip().endswith("/"):
            target_dir = find_canonical_dir(url_for_lookup)
            if target_dir:
                new_url = rel_link(path, target_dir) + "/"
                if new_url != url:
                    changes += 1
                    return f"{prefix}{new_url}{suffix}"
            return m.group(0)

        target = find_canonical_target(url_for_lookup)
        if not target:
            # Repo-root files outside docs (e.g. .env.example)
            name = Path(url_for_lookup).name
            root_candidate = ROOT / name
            if root_candidate.exists() and name.startswith("."):
                new_url = rel_link(path, root_candidate) + anchor
                if new_url != url:
                    changes += 1
                    return f"{prefix}{new_url}{suffix}"
            return m.group(0)

        new_url = rel_link(path, target) + query + anchor
        if new_url != url:
            changes += 1
            return f"{prefix}{new_url}{suffix}"
        return m.group(0)

    updated = LINK_RE.sub(replacer, text)
    if changes:
        path.write_text(updated, encoding="utf-8")
    return changes


def main() -> None:
    _build_index()
    total = 0
    for path in sorted(DOCS.rglob("*.md")):
        n = fix_file(path)
        if n:
            print(f"Fixed {n} links in {path.relative_to(ROOT)}")
            total += n
    print(f"TOTAL_FIXES={total}")


if __name__ == "__main__":
    main()
