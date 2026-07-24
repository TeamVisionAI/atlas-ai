import { useEffect } from "react";

export function useWorkspaceKeyboardShortcuts({
  enabled,
  onRefresh,
  onToggleTimeline,
  onNavigateBack
}) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    function handleKeyDown(event) {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable;

      if (isEditable || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        onRefresh?.();
        return;
      }

      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        onToggleTimeline?.();
        return;
      }

      if (event.key === "Escape") {
        onNavigateBack?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onNavigateBack, onRefresh, onToggleTimeline]);
}
