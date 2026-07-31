import { useCallback, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { usePromptDialog } from "./usePromptDialog";
import { saveNote } from "../engines/notesEngine";

/**
 * Universal Add Note flow — one modal and one save path for all workspaces.
 */
export function useUniversalNote({ getContext, onSaved, onError }) {
  const { translate } = useLanguage();
  const { prompt, promptDialog } = usePromptDialog();
  const [saving, setSaving] = useState(false);

  const openAddNote = useCallback(async (contextOverride) => {
    const context = contextOverride || getContext?.();

    if (!context?.prospectPhone) {
      onError?.(translate("workspaceActivityNoteError"));
      return { success: false };
    }

    const text = await prompt({
      title: translate("missionControlActionNotes"),
      label: translate("missionControlAddNotePrompt"),
      placeholder: translate("workspaceActivityAddNotePlaceholder"),
      confirmLabel: translate("workspaceActivityAddNote"),
      cancelLabel: translate("workspaceCancel"),
      multiline: true
    });

    if (!text) {
      return { success: false, cancelled: true };
    }

    setSaving(true);

    try {
      const result = await saveNote({
        phone: context.prospectPhone,
        text,
        context
      });

      if (!result?.success) {
        onError?.(result.message || translate("workspaceActivityNoteError"));
        return result;
      }

      await onSaved?.(result);
      return result;
    } catch (error) {
      console.error(error);
      onError?.(translate("workspaceActivityNoteError"));
      return { success: false, message: error.message };
    } finally {
      setSaving(false);
    }
  }, [getContext, onError, onSaved, prompt, translate]);

  return {
    openAddNote,
    noteDialog: promptDialog,
    saving
  };
}
