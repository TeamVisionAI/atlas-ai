import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { useUrgentAppointmentHandoffs } from "../../hooks/useUrgentAppointmentHandoffs";
import AtlasButton from "../ui/AtlasButton";
import "./UrgentAppointmentHandoffBanner.css";

function formatStartTime(value, translate) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return translate("urgentHandoffTimeUnknown");
  }
}

export default function UrgentAppointmentHandoffBanner({ enabled = true }) {
  const { translate } = useLanguage();
  const { items, acknowledge } = useUrgentAppointmentHandoffs(enabled);
  const [acknowledgingId, setAcknowledgingId] = useState(null);

  if (!enabled || !items.length) {
    return null;
  }

  async function handleAcknowledge(handoffId) {
    setAcknowledgingId(handoffId);
    try {
      await acknowledge(handoffId);
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <div className="urgent-handoff-stack" role="region" aria-label={translate("urgentHandoffRegionLabel")}>
      {items.map((item) => (
        <article key={item.id} className="urgent-handoff-banner" role="alert">
          <div className="urgent-handoff-banner__content">
            <p className="urgent-handoff-banner__title">{translate("urgentHandoffTitle")}</p>
            <p className="urgent-handoff-banner__meta">
              <strong>{item.prospectName || item.prospectPhone}</strong>
              {" · "}
              {item.purposeLabel || item.purpose}
              {" · "}
              {item.meetingTypeLabel || item.meetingType}
            </p>
            <p className="urgent-handoff-banner__meta">
              {formatStartTime(item.appointmentStart, translate)}
              {" · "}
              {translate("urgentHandoffMinutesUntilStart", {
                count: item.minutesUntilStart ?? 0
              })}
            </p>
          </div>
          <div className="urgent-handoff-banner__actions">
            {item.prospectWorkspacePath ? (
              <Link className="urgent-handoff-banner__link" to={item.prospectWorkspacePath}>
                {translate("urgentHandoffOpenProspect")}
              </Link>
            ) : null}
            <AtlasButton
              type="button"
              variant="primary"
              size="sm"
              disabled={acknowledgingId === item.id}
              onClick={() => handleAcknowledge(item.id)}
            >
              {translate("urgentHandoffAcknowledge")}
            </AtlasButton>
          </div>
        </article>
      ))}
    </div>
  );
}
