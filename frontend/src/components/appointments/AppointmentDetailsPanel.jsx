import { useLanguage } from "../../i18n/LanguageContext";
import AtlasButton from "../ui/AtlasButton";
import { buildProspectWorkspacePath } from "../../utils/prospectRoutes";
import { Link } from "react-router-dom";

export function HumanAssistPanel({ appointment, onReschedule, onResolve, translate: translateProp }) {
  const { translate: translateHook } = useLanguage();
  const translate = translateProp || translateHook;
  const assist = appointment.metadata?.humanAssist || {};

  return (
    <section className="human-assist-panel" aria-label={translate("appointmentsHumanAssistPanel")}>
      <header className="human-assist-panel__header">
        <span className="human-assist-panel__badge">{translate("appointmentsView_human_assist")}</span>
        <strong>{assist.summary || appointment.humanAssistReason || translate("appointmentsHumanAssistRequired")}</strong>
      </header>
      <dl className="human-assist-panel__meta">
        <div>
          <dt>{translate("appointmentsAssistReason")}</dt>
          <dd>{appointment.humanAssistReason || assist.reason || "—"}</dd>
        </div>
        <div>
          <dt>{translate("appointmentsStatusLabel")}</dt>
          <dd>{assist.status || appointment.status}</dd>
        </div>
        <div>
          <dt>{translate("appointmentsProspect")}</dt>
          <dd>{appointment.prospectName || appointment.prospectPhone}</dd>
        </div>
      </dl>
      <div className="human-assist-panel__actions">
        <Link to={buildProspectWorkspacePath(appointment.prospectPhone)} className="appointment-action-link">
          {translate("appointmentsOpenProspect")}
        </Link>
        <AtlasButton variant="secondary" size="sm" onClick={() => onReschedule?.(appointment)}>
          {translate("appointmentsReschedule")}
        </AtlasButton>
        <AtlasButton variant="primary" size="sm" onClick={() => onResolve?.(appointment)}>
          {translate("appointmentsResolveAssist")}
        </AtlasButton>
      </div>
    </section>
  );
}

export function AppointmentHistoryPanel({ appointment, locale }) {
  const { translate } = useLanguage();
  const history = appointment.history || [];

  if (!history.length) {
    return <p className="appointment-modal__hint">{translate("appointmentsNoHistory")}</p>;
  }

  return (
    <ol className="appointment-history">
      {history.map((event, index) => (
        <li key={`${event.type}-${event.at}-${index}`} className="appointment-history__item">
          <div className="appointment-history__top">
            <strong>{translate(`appointmentsHistory_${event.type}`) || event.type}</strong>
            <time dateTime={event.at}>
              {event.at ? new Date(event.at).toLocaleString(locale) : "—"}
            </time>
          </div>
          {event.actor ? <p className="appointment-history__actor">{translate("appointmentsHistoryActor")}: {event.actor}</p> : null}
          {event.reason ? <p className="appointment-history__reason">{translate("appointmentsHistoryReason")}: {event.reason}</p> : null}
          {event.summary ? <p>{event.summary}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function AppointmentDetailsPanel({ appointment, onClose, locale }) {
  const { translate } = useLanguage();

  return (
    <aside className="appointment-details-panel">
      <header className="appointment-details-panel__header">
        <h2>{translate("appointmentsDetailsTitle")}</h2>
        <button type="button" className="appointment-modal__close" onClick={onClose} aria-label={translate("appointmentsClose")}>
          ×
        </button>
      </header>
      <div className="appointment-details-panel__body">
        {appointment.humanAssistRequired ? (
          <HumanAssistPanel appointment={appointment} translate={translate} />
        ) : null}
        <section>
          <h3>{translate("appointmentsHistoryTitle")}</h3>
          <AppointmentHistoryPanel appointment={appointment} locale={locale} />
        </section>
      </div>
    </aside>
  );
}
