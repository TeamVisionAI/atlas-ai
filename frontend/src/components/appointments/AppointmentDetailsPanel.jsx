import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AtlasButton from "../ui/AtlasButton";
import { buildProspectWorkspacePath } from "../../utils/prospectRoutes";
import { presentHistoryActorLabel } from "../../engines/agentNotificationPresentation";
import { shouldShowLifecycleActions } from "../../engines/appointmentCardPresentation";
import { fetchAgendaContact } from "../../services/agendaService";
import { Link } from "react-router-dom";

function displayOrDash(value) {
  const text = String(value || "").trim();
  return text || "—";
}

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
        <Link to={buildProspectWorkspacePath({ phone: appointment.prospectPhone })} className="appointment-action-link">
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
        <li key={`${event.type}-${event.at || event.timestamp}-${index}`} className="appointment-history__item">
          <div className="appointment-history__top">
            <strong>{translate(`appointmentsHistory_${event.type}`) || event.type}</strong>
            <time dateTime={event.at || event.timestamp}>
              {event.at || event.timestamp
                ? new Date(event.at || event.timestamp).toLocaleString(locale)
                : "—"}
            </time>
          </div>
          {presentHistoryActorLabel(event.actor, event.actorName) ? (
            <p className="appointment-history__actor">
              {translate("appointmentsHistoryActor")}: {presentHistoryActorLabel(event.actor, event.actorName)}
            </p>
          ) : null}
          {event.reason ? <p className="appointment-history__reason">{translate("appointmentsHistoryReason")}: {event.reason}</p> : null}
          {event.summary ? <p>{event.summary}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function AgendaContactDetails({ appointment, contact }) {
  const { translate } = useLanguage();
  const phone =
    contact?.phone ||
    appointment.prospectVisiblePhone ||
    appointment.metadata?.agendaContactPhone ||
    null;
  const email = contact?.email || appointment.metadata?.agendaContactEmail || appointment.prospectEmail;
  const language =
    contact?.preferredLanguage || appointment.metadata?.agendaContactLanguage || null;
  const owner = contact?.ownerDisplayName || appointment.interviewerName || null;
  const source = contact?.source || appointment.metadata?.agendaContactSource || null;
  const notes = contact?.notes || appointment.metadata?.agendaContactNotes || appointment.meetingNotes;

  return (
    <section className="agenda-contact-details" data-agenda-contact="true">
      <h3>{translate("agendaContactDetailsTitle")}</h3>
      <dl className="agenda-contact-details__list">
        <div>
          <dt>{translate("agendaContactName")}</dt>
          <dd>{displayOrDash(contact?.name || appointment.metadata?.agendaContactName || appointment.prospectName)}</dd>
        </div>
        <div>
          <dt>{translate("agendaContactPhone")}</dt>
          <dd>
            {phone ? (
              <a href={`tel:${phone}`}>{phone}</a>
            ) : (
              translate("agendaContactPhoneUnavailable")
            )}
          </dd>
        </div>
        <div>
          <dt>{translate("agendaContactEmail")}</dt>
          <dd>{displayOrDash(email)}</dd>
        </div>
        <div>
          <dt>{translate("agendaContactLanguage")}</dt>
          <dd>{displayOrDash(language)}</dd>
        </div>
        <div>
          <dt>{translate("agendaContactOwner")}</dt>
          <dd>{displayOrDash(owner)}</dd>
        </div>
        <div>
          <dt>{translate("agendaContactSource")}</dt>
          <dd>{displayOrDash(source)}</dd>
        </div>
        <div>
          <dt>{translate("agendaContactNotes")}</dt>
          <dd>{displayOrDash(notes)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function AppointmentDetailsPanel({
  appointment,
  onClose,
  locale,
  onReschedule,
  onCancel,
  onComplete,
  onPromoteRecruit,
  onPromoteClient,
  onOpenClient
}) {
  const { translate } = useLanguage();
  const standaloneAgenda = appointment?.metadata?.standaloneAgenda === true;
  const canMutate = shouldShowLifecycleActions(appointment);
  const promotedRecruit = Boolean(appointment?.metadata?.promotedToRecruit || appointment?.prospectId);
  const promotedClient = Boolean(appointment?.metadata?.promotedToClient);
  const [contact, setContact] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setContact(null);

    if (!appointment?.agendaContactId) {
      return undefined;
    }

    fetchAgendaContact(appointment.agendaContactId)
      .then((result) => {
        if (!cancelled) {
          setContact(result?.contact || result || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContact(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appointment?.agendaContactId]);

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

        {standaloneAgenda || appointment.agendaContactId ? (
          <AgendaContactDetails appointment={appointment} contact={contact} />
        ) : null}

        {standaloneAgenda ? (
          <section className="appointment-details-panel__actions" aria-label={translate("agendaActionsLabel")}>
            {canMutate ? (
              <AtlasButton variant="secondary" size="sm" onClick={() => onComplete?.(appointment)}>
                {translate("agendaRecordOutcome")}
              </AtlasButton>
            ) : null}
            {canMutate ? (
              <AtlasButton variant="secondary" size="sm" onClick={() => onReschedule?.(appointment)}>
                {translate("appointmentsRescheduleInterview")}
              </AtlasButton>
            ) : null}
            {canMutate ? (
              <AtlasButton variant="ghost" size="sm" onClick={() => onCancel?.(appointment)}>
                {translate("appointmentsCancel")}
              </AtlasButton>
            ) : null}
            {!promotedRecruit ? (
              <AtlasButton variant="secondary" size="sm" onClick={() => onPromoteRecruit?.(appointment)}>
                {translate("agendaPromoteRecruit")}
              </AtlasButton>
            ) : null}
            {!promotedClient ? (
              <AtlasButton variant="secondary" size="sm" onClick={() => onPromoteClient?.(appointment)}>
                {translate("agendaPromoteClient")}
              </AtlasButton>
            ) : (
              <AtlasButton variant="secondary" size="sm" onClick={() => onOpenClient?.(appointment)}>
                {translate("agendaOpenClient")}
              </AtlasButton>
            )}
          </section>
        ) : null}

        <section>
          <h3>{translate("appointmentsHistoryTitle")}</h3>
          <AppointmentHistoryPanel appointment={appointment} locale={locale} />
        </section>
      </div>
    </aside>
  );
}
