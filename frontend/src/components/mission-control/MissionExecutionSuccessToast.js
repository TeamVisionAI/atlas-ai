import { useToast } from "../ui/ToastProvider";
import { useLanguage } from "../../i18n/LanguageContext";

export function useMissionExecutionSuccessToast() {
  const { showSuccess } = useToast();
  const { translate } = useLanguage();

  return function showMissionExecutionSuccess(result) {
    const lines = [translate("missionExecutionSuccessTitle")];

    if (result?.zoomLink || result?.meetLink) {
      lines.push(translate("missionExecutionSuccessZoomLink"));
    } else {
      lines.push(translate("missionExecutionSuccessInvitation"));
    }

    lines.push(translate("missionExecutionSuccessMissionComplete"));

    showSuccess(lines.join(" "));
  };
}
