import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../security/isGlobalSuperAdminControlPlane";
import ControlPlaneEmptyState from "../components/layout/ControlPlaneEmptyState";
import AtlasButton from "../components/ui/AtlasButton";
import AtlasSelect from "../components/ui/AtlasSelect";
import StatusBadge from "../components/ui/StatusBadge";
import Spinner from "../components/ui/Spinner";
import {
  fetchAppointment,
  fetchAppointments,
  getAppointmentIdentityKey,
  normalizeAppointmentList
} from "../services/appointmentService";
import { navigateToProspectWorkspace } from "../utils/prospectRoutes";
import { appPath } from "../config/appRoutes";
import RescheduleAppointmentDialog from "../components/appointments/RescheduleAppointmentDialog";
import CancelAppointmentDialog from "../components/appointments/CancelAppointmentDialog";
import CompleteAppointmentDialog from "../components/appointments/CompleteAppointmentDialog";
import PromoteAgendaContactDialog from "../components/agenda/PromoteAgendaContactDialog";
import ResolveHumanAssistDialog from "../components/appointments/ResolveHumanAssistDialog";
import {
  AppointmentDetailsPanel,
  HumanAssistPanel
} from "../components/appointments/AppointmentDetailsPanel";
import AppointmentErrorCard from "../components/appointments/AppointmentErrorCard";
import { captureAppointmentError } from "../utils/appointmentErrors";
import { useUniversalNote } from "../hooks/useUniversalNote";
import { buildAppointmentNoteContext } from "../engines/notesEngine";
import AppointmentCardActions from "../components/appointments/AppointmentCardActions";
import AppointmentCardContactLine from "../components/appointments/AppointmentCardContactLine";
import {
  buildAppointmentCardAddressModel,
  buildAppointmentCardContactModel,
  formatAppointmentMetaLabel
} from "../engines/appointmentCardPresentation";
import { resolveAppointmentDisplayStatus } from "../engines/interviewWorkflowPresentationEngine";
import "../styles/atlas-ui.css";
import "./AppointmentsPage.css";

const VIEWS = [
  "today",
  "upcoming",
  "pending_confirmation",
  "human_assist",
  "completed",
  "cancelled"
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatWhen(iso, locale) {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function purposeLabel(purpose, translate) {
  const key = `appointmentsPurpose_${purpose}`;
  const translated = translate(key);
  return translated === key ? purpose.replace(/_/g, " ") : translated;
}

function statusLabel(status, translate) {
  const key = `appointmentsStatus_${status}`;
  const translated = translate(key);
  return translated === key ? status.replace(/_/g, " ") : translated;
}

function statusVariant(status) {
  switch (status) {
    case "completed":
      return "success";
    case "cancelled":
      return "neutral";
    case "human_assist_required":
      return "danger";
    case "pending_confirmation":
      return "warning";
    case "confirmed":
      return "info";
    case "scheduled":
    default:
      return "info";
  }
}

function meetingTypeLabel(type, translate) {
  const key = `appointmentsMeetingType_${type}`;
  const translated = translate(key);
  return translated === key ? type.replace(/_/g, " ") : translated;
}

export default function AppointmentsPage() {
  const { translate, locale } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = searchParams.get("view") || "today";
  const focusAppointmentId = searchParams.get("appointmentId") || "";

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionMessage, setActionMessage] = useState("");
  const [filters, setFilters] = useState({ purpose: "", meetingType: "" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [dialog, setDialog] = useState(null);

  const activeFilterCount = useMemo(
    () => [filters.purpose, filters.meetingType].filter(Boolean).length,
    [filters.meetingType, filters.purpose]
  );

  const purposeOptions = useMemo(
    () => [
      { value: "", label: translate("appointmentsFilterAll") },
      { value: "recruiting_interview", label: purposeLabel("recruiting_interview", translate) },
      { value: "fna", label: purposeLabel("fna", translate) },
      { value: "policy_review", label: purposeLabel("policy_review", translate) }
    ],
    [translate]
  );

  const meetingTypeOptions = useMemo(
    () => [
      { value: "", label: translate("appointmentsFilterAll") },
      { value: "virtual", label: meetingTypeLabel("virtual", translate) },
      { value: "in_person", label: meetingTypeLabel("in_person", translate) },
      { value: "phone", label: meetingTypeLabel("phone", translate) }
    ],
    [translate]
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (controlPlane) {
      setAppointments([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const result = await fetchAppointments({
        view: activeView,
        purpose: filters.purpose || undefined,
        meetingType: filters.meetingType || undefined
      });
      setAppointments(normalizeAppointmentList(result));
    } catch (requestError) {
      if (!silent) {
        setLoadError(captureAppointmentError("load", requestError, translate));
        setAppointments([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [activeView, filters.meetingType, filters.purpose, translate, controlPlane]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeFilterCount > 0) {
      setFiltersOpen(true);
    }
  }, [activeFilterCount]);

  const emptyTitle = useMemo(() => {
    return translate(`appointmentsEmptyTitle_${activeView}`) || translate("appointmentsEmptyTitleDefault");
  }, [activeView, translate]);

  const emptyBody = useMemo(() => {
    return translate(`appointmentsEmpty_${activeView}`) || translate("appointmentsEmptyDefault");
  }, [activeView, translate]);

  const { openAddNote, noteDialog, saving: noteSaving } = useUniversalNote({
    onSaved: () => {
      setActionMessage(translate("workspaceToastActionCompleted"));
    },
    onError: (message) => setActionMessage(message)
  });

  const handleAddAppointmentNote = useCallback(
    (appointment) =>
      openAddNote(
        buildAppointmentNoteContext({
          phone: appointment.prospectPhone,
          appointmentId: appointment.id
        })
      ),
    [openAddNote]
  );

  function setView(view) {
    const next = new URLSearchParams(searchParams);
    next.set("view", view);
    setSearchParams(next);
  }

  useEffect(() => {
    if (!focusAppointmentId || controlPlane) {
      return undefined;
    }

    const fromList = appointments.find((item) => String(item.id) === String(focusAppointmentId));
    if (fromList) {
      setSelectedAppointment(fromList);
      return undefined;
    }

    let cancelled = false;
    fetchAppointment(focusAppointmentId)
      .then((appointment) => {
        if (!cancelled && appointment?.id) {
          setSelectedAppointment(appointment);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [appointments, controlPlane, focusAppointmentId]);

  function openDialog(type, appointment) {
    setDialog({ type, appointment });
  }

  function closeDialog() {
    setDialog(null);
  }

  function handleActionSuccess(message, updatedAppointment) {
    setActionMessage(message || translate("appointmentsActionSuccess"));

    if (updatedAppointment) {
      const identityKey = getAppointmentIdentityKey(updatedAppointment);

      setAppointments((current) =>
        current.filter(
          (item) =>
            item.id !== updatedAppointment.id && getAppointmentIdentityKey(item) !== identityKey
        )
      );

      if (
        selectedAppointment &&
        (selectedAppointment.id === updatedAppointment.id ||
          getAppointmentIdentityKey(selectedAppointment) === identityKey)
      ) {
        setSelectedAppointment(null);
      }

      void load({ silent: true });
      return;
    }

    load();
  }

  function clearFilters() {
    setFilters({ purpose: "", meetingType: "" });
  }

  function emptyPrimaryAction() {
    if (activeView === "today") {
      setView("upcoming");
      return;
    }

    navigate("/app/settings/appointments");
  }

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  return (
    <div className="appointments-page">
      <header className="appointments-page__header">
        <div className="appointments-page__header-copy">
          <h1>{translate("navAppointments")}</h1>
          <p>{translate("appointmentsSubtitle")}</p>
        </div>
        <Link to="/app/settings/appointments" className="appointments-page__settings-link">
          {translate("appointmentsSettingsLink")}
        </Link>
      </header>

      <div className="appointments-page__toolbar">
        <nav className="appointments-page__views" aria-label={translate("appointmentsViewsLabel")}>
          {VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              className={`appointments-page__view-tab${activeView === view ? " appointments-page__view-tab--active" : ""}`}
              onClick={() => setView(view)}
            >
              {translate(`appointmentsView_${view}`)}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className={`appointments-page__filters-toggle${filtersOpen ? " appointments-page__filters-toggle--open" : ""}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((current) => !current)}
        >
          {translate("appointmentsFiltersToggle")}
          {activeFilterCount > 0 ? (
            <span className="appointments-page__filters-count">{activeFilterCount}</span>
          ) : null}
        </button>
      </div>

      {filtersOpen ? (
        <div className="appointments-page__filters-panel">
          <AtlasSelect
            label={translate("appointmentsFilterPurpose")}
            value={filters.purpose}
            onChange={(value) => setFilters((current) => ({ ...current, purpose: value }))}
            options={purposeOptions}
          />
          <AtlasSelect
            label={translate("appointmentsFilterMeetingType")}
            value={filters.meetingType}
            onChange={(value) => setFilters((current) => ({ ...current, meetingType: value }))}
            options={meetingTypeOptions}
          />
          {activeFilterCount > 0 ? (
            <AtlasButton type="button" variant="ghost" size="sm" onClick={clearFilters}>
              {translate("appointmentsClearFilters")}
            </AtlasButton>
          ) : null}
        </div>
      ) : null}

      {actionMessage ? (
        <p className="appointments-page__message" role="status">
          {actionMessage}
        </p>
      ) : null}
      {loadError ? (
        <div className="appointments-page__error-wrap">
          <AppointmentErrorCard
            title={loadError.title}
            body={loadError.body}
            retryLabel={translate("appointmentsRetry")}
            onRetry={load}
          />
        </div>
      ) : (
      <div className="appointments-page__layout">
        <div className="appointments-page__main">
          {loading ? (
            <div className="appointments-page__loading" aria-live="polite">
              <Spinner inline label={translate("loading")} />
              <span>{translate("loading")}</span>
            </div>
          ) : appointments.length === 0 ? (
            <div className="appointments-page__empty-card" role="status">
              <div className="appointments-page__empty-icon" aria-hidden="true">
                ◷
              </div>
              <h2>{emptyTitle}</h2>
              <p>{emptyBody}</p>
              <div className="appointments-page__empty-actions">
                <AtlasButton type="button" variant="primary" onClick={emptyPrimaryAction}>
                  {activeView === "today"
                    ? translate("appointmentsEmptyActionUpcoming")
                    : translate("appointmentsEmptyActionSettings")}
                </AtlasButton>
                {activeView !== "today" ? (
                  <AtlasButton type="button" variant="secondary" onClick={() => setView("today")}>
                    {translate("appointmentsView_today")}
                  </AtlasButton>
                ) : (
                  <Link to="/app/settings/appointments" className="appointments-page__empty-link">
                    {translate("appointmentsSettingsLink")}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <ul className="appointments-page__list">
              {appointments.map((appointment) => {
                const isSelected = selectedAppointment?.id === appointment.id;
                const displayStatus = resolveAppointmentDisplayStatus(appointment);
                const contactModel = buildAppointmentCardContactModel(appointment, {
                  phoneUnavailableLabel: "Phone unavailable"
                });
                const addressModel = buildAppointmentCardAddressModel(appointment);

                return (
                  <li
                    key={appointment.id}
                    className={`appointments-page__card${isSelected ? " appointments-page__card--selected" : ""}`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className="appointments-page__card-select"
                      onClick={() => setSelectedAppointment(appointment)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedAppointment(appointment);
                        }
                      }}
                    >
                      <div className="appointments-page__card-top">
                        <strong className="appointments-page__prospect">
                          {appointment.prospectName || contactModel.contactLabel}
                        </strong>
                        <StatusBadge variant={statusVariant(displayStatus)}>
                          {statusLabel(displayStatus, translate)}
                        </StatusBadge>
                      </div>
                      <AppointmentCardContactLine
                        contact={contactModel}
                        translate={translate}
                      />
                      <p className="appointments-page__when">{formatWhen(appointment.startDateTime, locale)}</p>
                      <p className="appointments-page__meta">
                        {formatAppointmentMetaLabel(
                          appointment,
                          translate,
                          purposeLabel(appointment.purpose, translate)
                        )}
                      </p>
                      {addressModel ? (
                        <a
                          className="appointments-page__address"
                          href={addressModel.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {addressModel.lines.map((line) => (
                            <span key={line} className="appointments-page__address-line">
                              {line}
                            </span>
                          ))}
                        </a>
                      ) : null}
                      {(appointment.rescheduleCount > 0 ||
                        appointment.emailStatus === "missing" ||
                        appointment.humanAssistRequired) && (
                        <div className="appointments-page__flags">
                          {appointment.humanAssistRequired ? (
                            <span className="appointments-page__flag appointments-page__flag--assist">
                              {translate("appointmentsView_human_assist")}
                            </span>
                          ) : null}
                          {appointment.emailStatus === "missing" ? (
                            <span className="appointments-page__flag">
                              {translate("appointmentsMissingEmail")}
                            </span>
                          ) : null}
                          {appointment.rescheduleCount > 0 ? (
                            <span className="appointments-page__flag">
                              {translate("appointmentsRescheduleCount")}: {appointment.rescheduleCount}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {appointment.humanAssistRequired ? (
                      <HumanAssistPanel
                        appointment={appointment}
                        onReschedule={(item) => openDialog("reschedule", item)}
                        onResolve={(item) => openDialog("resolve", item)}
                      />
                    ) : null}

                    <AppointmentCardActions
                      appointment={appointment}
                      translate={translate}
                      noteSaving={noteSaving}
                      onAddNote={() => handleAddAppointmentNote(appointment)}
                      onOpenWorkspace={() =>
                        navigateToProspectWorkspace(navigate, appointment.prospectPhone)
                      }
                      onReschedule={() => openDialog("reschedule", appointment)}
                      onCancel={() => openDialog("cancel", appointment)}
                      onComplete={() => openDialog("complete", appointment)}
                      onPromoteRecruit={() => openDialog("promote-recruit", appointment)}
                      onPromoteClient={() => openDialog("promote-client", appointment)}
                      onOpenClient={() => {
                        const id = appointment.metadata?.promotedClientId;
                        if (id) navigate(appPath(`clients/${id}`));
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selectedAppointment ? (
          <AppointmentDetailsPanel
            appointment={selectedAppointment}
            locale={locale}
            onClose={() => setSelectedAppointment(null)}
            onReschedule={(item) => openDialog("reschedule", item)}
            onCancel={(item) => openDialog("cancel", item)}
            onComplete={(item) => openDialog("complete", item)}
            onPromoteRecruit={(item) => openDialog("promote-recruit", item)}
            onPromoteClient={(item) => openDialog("promote-client", item)}
            onOpenClient={(item) => {
              const id = item?.metadata?.promotedClientId;
              if (id) navigate(appPath(`clients/${id}`));
            }}
          />
        ) : null}
      </div>
      )}

      <RescheduleAppointmentDialog
        open={dialog?.type === "reschedule"}
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={() => handleActionSuccess(translate("appointmentsRescheduled"))}
      />
      <CancelAppointmentDialog
        open={dialog?.type === "cancel"}
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={(updatedAppointment) =>
          handleActionSuccess(translate("appointmentsCancelled"), updatedAppointment)
        }
      />
      <CompleteAppointmentDialog
        open={dialog?.type === "complete"}
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={(updatedAppointment) =>
          handleActionSuccess(translate("appointmentsCompleted"), updatedAppointment)
        }
      />
      <PromoteAgendaContactDialog
        open={dialog?.type === "promote-recruit"}
        mode="recruit"
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={(result) =>
          handleActionSuccess(
            result?.alreadyPromoted
              ? translate("agendaPromoteRecruitExisting")
              : translate("agendaPromoteRecruitSuccess"),
            result?.appointment
          )
        }
      />
      <PromoteAgendaContactDialog
        open={dialog?.type === "promote-client"}
        mode="client"
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={(result) => {
          handleActionSuccess(
            result?.alreadyPromoted
              ? translate("agendaPromoteClientExisting")
              : translate("agendaPromoteClientSuccess"),
            result?.appointment
          );
          if (result?.clientId) {
            navigate(appPath(`clients/${result.clientId}`));
          }
        }}
      />
      <ResolveHumanAssistDialog
        open={dialog?.type === "resolve"}
        appointment={dialog?.appointment}
        onClose={closeDialog}
        onSuccess={() => handleActionSuccess(translate("appointmentsAssistResolved"))}
      />
      {noteDialog}
    </div>
  );
}

export { DAY_LABELS };
