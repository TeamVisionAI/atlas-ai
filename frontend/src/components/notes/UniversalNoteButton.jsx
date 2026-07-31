import { useLanguage } from "../../i18n/LanguageContext";
import AtlasButton from "../ui/AtlasButton";

export default function UniversalNoteButton({ onClick, busy = false, className = "", size }) {
  const { translate } = useLanguage();

  return (
    <AtlasButton
      variant="secondary"
      size={size}
      className={`universal-note-button ${className}`.trim()}
      busy={busy}
      onClick={onClick}
    >
      {translate("missionControlActionNotes")}
    </AtlasButton>
  );
}
