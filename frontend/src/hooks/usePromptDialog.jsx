import { useCallback, useState } from "react";
import PromptDialog from "../components/ui/PromptDialog";

export function usePromptDialog() {
  const [dialog, setDialog] = useState(null);

  const prompt = useCallback(
    ({ title, label, placeholder, confirmLabel, cancelLabel, multiline = false }) =>
      new Promise((resolve) => {
        setDialog({
          title,
          label,
          placeholder,
          confirmLabel,
          cancelLabel,
          multiline,
          resolve
        });
      }),
    []
  );

  const closeDialog = useCallback(
    (value) => {
      dialog?.resolve(value);
      setDialog(null);
    },
    [dialog]
  );

  const promptDialog = (
    <PromptDialog
      open={Boolean(dialog)}
      title={dialog?.title}
      label={dialog?.label}
      placeholder={dialog?.placeholder}
      confirmLabel={dialog?.confirmLabel}
      cancelLabel={dialog?.cancelLabel}
      multiline={dialog?.multiline}
      onConfirm={(value) => closeDialog(value?.trim() || null)}
      onCancel={() => closeDialog(null)}
    />
  );

  return { prompt, promptDialog };
}
