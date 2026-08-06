/**
 * Prospect Workspace scroll ownership contract.
 * Scroll must remain on the layout content area — never a nested page shell.
 */

export const PROSPECT_WORKSPACE_SCROLL_ROOT_SELECTOR = ".atlas-layout__content";

/**
 * Resolve the authorized scroll container for Prospect Workspace.
 * @param {Element|null|undefined} fromEl
 * @returns {Element|null}
 */
export function resolveProspectWorkspaceScrollRoot(fromEl = null) {
  if (typeof document === "undefined") {
    return null;
  }

  if (fromEl?.closest) {
    const nested = fromEl.closest(PROSPECT_WORKSPACE_SCROLL_ROOT_SELECTOR);
    if (nested) {
      return nested;
    }
  }

  return document.querySelector(PROSPECT_WORKSPACE_SCROLL_ROOT_SELECTOR);
}

/**
 * True when a candidate element is a nested workspace shell scroll hijack.
 */
export function isForbiddenWorkspaceScrollShell(el) {
  if (!el?.classList) {
    return false;
  }

  return (
    el.classList.contains("prospect-workspace--shell") ||
    el.classList.contains("prospect-workspace__scroll-body")
  );
}

/**
 * Contract check used by tests — page markup must not own scroll.
 */
export function assertWorkspaceScrollContract({ pageSource = "", cssSource = "" } = {}) {
  const violations = [];

  if (pageSource.includes("prospect-workspace--shell")) {
    violations.push("page uses prospect-workspace--shell");
  }

  if (pageSource.includes("prospect-workspace__scroll-body")) {
    violations.push("page uses prospect-workspace__scroll-body");
  }

  if (/prospect-workspace--shell\s*\{[^}]*overflow:\s*hidden/s.test(cssSource)) {
    violations.push("css locks overflow on nested shell");
  }

  if (/prospect-workspace__scroll-body\s*\{[^}]*overflow-y:\s*auto/s.test(cssSource)) {
    violations.push("css assigns overflow-y auto to nested scroll-body");
  }

  return {
    ok: violations.length === 0,
    violations,
    scrollRootSelector: PROSPECT_WORKSPACE_SCROLL_ROOT_SELECTOR
  };
}
