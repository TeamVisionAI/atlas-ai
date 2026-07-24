import { useCallback, useState } from "react";
import ConfirmDialog from "../../../components/ui/ConfirmDialog";

export function useConfirmDialog() {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback(
    ({ title, body, confirmLabel, cancelLabel }) =>
      new Promise((resolve) => {
        setDialog({
          title,
          body,
          confirmLabel,
          cancelLabel,
          resolve
        });
      }),
    []
  );

  const closeDialog = useCallback(
    (result) => {
      dialog?.resolve(result);
      setDialog(null);
    },
    [dialog]
  );

  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(dialog)}
      title={dialog?.title}
      body={dialog?.body}
      confirmLabel={dialog?.confirmLabel}
      cancelLabel={dialog?.cancelLabel}
      onConfirm={() => closeDialog(true)}
      onCancel={() => closeDialog(false)}
    />
  );

  return { confirm, confirmDialog };
}
