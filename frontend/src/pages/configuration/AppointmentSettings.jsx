import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { isGlobalSuperAdminControlPlane } from "../../security/isGlobalSuperAdminControlPlane";
import { appPath } from "../../config/appRoutes";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import ControlPlaneEmptyState from "../../components/layout/ControlPlaneEmptyState";
import AtlasButton from "../../components/ui/AtlasButton";
import AtlasSelect from "../../components/ui/AtlasSelect";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../components/ui/ToastProvider";
import WorkingScheduleTimeline from "../../components/appointments/WorkingScheduleTimeline";
import AppointmentErrorCard from "../../components/appointments/AppointmentErrorCard";
import { captureAppointmentError } from "../../utils/appointmentErrors";
import { parseTimeToMinutes, minutesToTime } from "../../components/appointments/workingScheduleTimeUtils";
import { DAY_LABELS } from "../AppointmentsPage";
import {
  fetchAppointmentProfile,
  updateAppointmentProfile
} from "../../services/appointmentService";
import {
  APPOINTMENT_TIMEZONES,
  BUFFER_OPTIONS,
  DURATION_OPTIONS,
  buildAppointmentSettingsSavePayload,
  buildAppointmentSettingsSnapshot,
  calendarStatusLabel,
  calendarStatusVariant,
  formatLocationAddress,
  resolveCalendarSources
} from "./appointmentSettingsPresentation";
import "../configuration/Configuration.css";

const VIRTUAL_PROVIDERS = [
  { value: "zoom", label: "Zoom" },
  { value: "whatsapp_video", label: "WhatsApp Video" },
  { value: "phone_call", label: "Phone Call" }
];

function numberOptions(values, suffix) {
  return values.map((value) => ({
    value: String(value),
    label: suffix ? `${value} ${suffix}` : String(value)
  }));
}

export default function AppointmentSettings() {
  const { translate } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const { showSuccess, showError } = useToast();
  const controlPlane = isGlobalSuperAdminControlPlane(user, supportMode);
  const [profile, setProfile] = useState(null);
  const [calendarSources, setCalendarSources] = useState({ google: {}, icloud: {} });
  const [zoomStatus, setZoomStatus] = useState({ connected: false, source: null });
  const [organizationOffice, setOrganizationOffice] = useState({
    address: null,
    configured: false
  });
  const [baseline, setBaseline] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [editingLocationId, setEditingLocationId] = useState(null);

  const applyPayload = useCallback((result) => {
    setProfile(result.profile);
    setCalendarSources(resolveCalendarSources(result));
    setZoomStatus(result.zoomStatus || { connected: false, source: null });
    setOrganizationOffice(
      result.organizationOffice || { address: null, configured: false }
    );
    setBaseline(buildAppointmentSettingsSnapshot(result.profile));
  }, []);

  const load = useCallback(async () => {
    if (controlPlane) {
      return;
    }
    setLoadError(null);

    try {
      const result = await fetchAppointmentProfile();
      if (result?.controlPlane) {
        return;
      }
      applyPayload(result);
    } catch (requestError) {
      setLoadError(captureAppointmentError("settings_load", requestError, translate));
    }
  }, [applyPayload, controlPlane, translate]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(
    () => Boolean(profile) && buildAppointmentSettingsSnapshot(profile) !== baseline,
    [baseline, profile]
  );

  function updateDay(dayOfWeek, patch) {
    setProfile((current) => {
      const appointmentProfile = { ...current.appointmentProfile };
      appointmentProfile.workingSchedule = appointmentProfile.workingSchedule.map((day) =>
        day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day
      );
      return { ...current, appointmentProfile };
    });
  }

  function updateDayBlock(dayOfWeek, blockIndex, patch) {
    setProfile((current) => {
      const appointmentProfile = { ...current.appointmentProfile };
      appointmentProfile.workingSchedule = appointmentProfile.workingSchedule.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) {
          return day;
        }
        const blocks = day.blocks.map((block, index) =>
          index === blockIndex ? { ...block, ...patch } : block
        );
        return { ...day, blocks };
      });
      return { ...current, appointmentProfile };
    });
  }

  function removeDayBlock(dayOfWeek, blockIndex) {
    setProfile((current) => {
      const appointmentProfile = { ...current.appointmentProfile };
      appointmentProfile.workingSchedule = appointmentProfile.workingSchedule.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) {
          return day;
        }
        const blocks = day.blocks.filter((_, index) => index !== blockIndex);
        return {
          ...day,
          blocks: blocks.length > 0 ? blocks : [{ start: "09:00", end: "17:00" }]
        };
      });
      return { ...current, appointmentProfile };
    });
  }

  function addDayBlock(dayOfWeek) {
    setProfile((current) => {
      const appointmentProfile = { ...current.appointmentProfile };
      appointmentProfile.workingSchedule = appointmentProfile.workingSchedule.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) {
          return day;
        }
        const lastBlock = day.blocks[day.blocks.length - 1];
        const lastEnd = parseTimeToMinutes(lastBlock?.end || "12:00");
        const newStart = Math.min(lastEnd + 60, 19 * 60);
        const newEnd = Math.min(newStart + 180, 22 * 60);
        return {
          ...day,
          blocks: [...day.blocks, { start: minutesToTime(newStart), end: minutesToTime(newEnd) }]
        };
      });
      return { ...current, appointmentProfile };
    });
  }

  function updateDefaults(field, value) {
    setProfile((current) => ({
      ...current,
      appointmentProfile: {
        ...current.appointmentProfile,
        defaults: {
          ...current.appointmentProfile.defaults,
          [field]: value
        }
      }
    }));
  }

  function updateVirtual(field, value) {
    setProfile((current) => ({
      ...current,
      appointmentProfile: {
        ...current.appointmentProfile,
        virtualMeeting: {
          ...current.appointmentProfile.virtualMeeting,
          [field]: value
        }
      }
    }));
  }

  function updateOffice(field, value) {
    setProfile((current) => ({
      ...current,
      appointmentProfile: {
        ...current.appointmentProfile,
        office: {
          ...current.appointmentProfile.office,
          [field]: value
        }
      }
    }));
  }

  function updateLocation(id, field, value) {
    setProfile((current) => ({
      ...current,
      appointmentProfile: {
        ...current.appointmentProfile,
        favoritePublicLocations: current.appointmentProfile.favoritePublicLocations.map(
          (location) => (location.id === id ? { ...location, [field]: value } : location)
        )
      }
    }));
  }

  function addLocation() {
    const id = crypto.randomUUID();
    setProfile((current) => ({
      ...current,
      appointmentProfile: {
        ...current.appointmentProfile,
        favoritePublicLocations: [
          ...current.appointmentProfile.favoritePublicLocations,
          {
            id,
            name: "",
            address: "",
            city: "",
            state: "",
            postalCode: "",
            mapsLink: "",
            notes: ""
          }
        ]
      }
    }));
    setEditingLocationId(id);
  }

  function removeLocation(id) {
    setProfile((current) => ({
      ...current,
      appointmentProfile: {
        ...current.appointmentProfile,
        favoritePublicLocations: current.appointmentProfile.favoritePublicLocations.filter(
          (location) => location.id !== id
        )
      }
    }));
    if (editingLocationId === id) {
      setEditingLocationId(null);
    }
  }

  function validate(payload) {
    const nextErrors = {};
    const timezone = String(payload?.defaults?.timezone || "").trim();
    if (!timezone) {
      nextErrors.timezone = translate("appointmentsTimezoneRequired");
    }
    (payload?.favoritePublicLocations || []).forEach((location) => {
      if (!String(location.name || "").trim() && !String(location.address || "").trim()) {
        nextErrors[`location-${location.id}`] = translate("appointmentsLocationRequired");
      }
    });
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function persistProfile(payload) {
    if (!validate(payload)) {
      return;
    }

    setSaving(true);
    setActionError(null);

    try {
      const result = await updateAppointmentProfile(payload);
      applyPayload({
        ...result,
        calendarSources: {
          google: calendarSources.google,
          icloud: calendarSources.icloud
        },
        zoomStatus,
        organizationOffice
      });
      showSuccess(translate("configurationSaved"));
    } catch (requestError) {
      const copy = captureAppointmentError("settings_save", requestError, translate);
      setActionError({
        ...copy,
        retry: () => persistProfile(payload)
      });
      showError(copy.body || translate("configurationLoadFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function applyPreset(preset) {
    await persistProfile({ schedulePreset: preset });
  }

  async function save(event) {
    event.preventDefault();
    const payload = buildAppointmentSettingsSavePayload(profile);
    if (!payload) {
      return;
    }
    await persistProfile(payload);
  }

  if (controlPlane) {
    return <ControlPlaneEmptyState translate={translate} />;
  }

  if (loadError && !profile) {
    return (
      <AppointmentErrorCard
        title={loadError.title}
        body={loadError.body}
        retryLabel={translate("appointmentsRetry")}
        onRetry={load}
      />
    );
  }

  if (!profile) {
    return <ConfigurationLoading />;
  }

  const { appointmentProfile } = profile;
  const durationSuffix = translate("appointmentsMinutesShort");
  const officeLocked = organizationOffice.configured === true;
  const locations = appointmentProfile.favoritePublicLocations || [];

  return (
    <form className="configuration-form appointment-settings" onSubmit={save}>
      <header className="appointment-settings__header">
        <h2 className="appointment-settings__title">{translate("appointmentsSettingsPageTitle")}</h2>
        <p className="appointment-settings__subtitle">
          {translate("appointmentsSettingsPageSubtitle")}
        </p>
      </header>

      <ConfigurationSection
        title={translate("appointmentsSettingsDefaults")}
        description={translate("appointmentsSettingsDefaultsDesc")}
      >
        <div className="configuration-grid-2">
          <AtlasSelect
            label={translate("appointmentsDefaultDuration")}
            value={String(appointmentProfile.defaults.defaultDurationMinutes)}
            options={numberOptions(DURATION_OPTIONS, durationSuffix)}
            onChange={(value) => updateDefaults("defaultDurationMinutes", Number(value))}
          />
          <AtlasSelect
            label={translate("appointmentsRecruitingDuration")}
            value={String(appointmentProfile.defaults.recruitingInterviewDurationMinutes)}
            options={numberOptions(DURATION_OPTIONS, durationSuffix)}
            onChange={(value) =>
              updateDefaults("recruitingInterviewDurationMinutes", Number(value))
            }
          />
          <AtlasSelect
            label={translate("appointmentsBufferBefore")}
            value={String(appointmentProfile.defaults.bufferBeforeMinutes)}
            options={numberOptions(BUFFER_OPTIONS, durationSuffix)}
            onChange={(value) => updateDefaults("bufferBeforeMinutes", Number(value))}
          />
          <AtlasSelect
            label={translate("appointmentsBufferAfter")}
            value={String(appointmentProfile.defaults.bufferAfterMinutes)}
            options={numberOptions(BUFFER_OPTIONS, durationSuffix)}
            onChange={(value) => updateDefaults("bufferAfterMinutes", Number(value))}
          />
          <label>
            {translate("configurationTimezone")}
            <select
              value={appointmentProfile.defaults.timezone}
              onChange={(event) => updateDefaults("timezone", event.target.value)}
            >
              {!APPOINTMENT_TIMEZONES.some(
                (zone) => zone.value === appointmentProfile.defaults.timezone
              ) ? (
                <option value={appointmentProfile.defaults.timezone}>
                  {appointmentProfile.defaults.timezone}
                </option>
              ) : null}
              {APPOINTMENT_TIMEZONES.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </select>
            {fieldErrors.timezone ? (
              <span className="appointment-settings__error">{fieldErrors.timezone}</span>
            ) : null}
          </label>
        </div>
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsSettingsWorkingSchedule")}
        description={translate("appointmentsSettingsWorkingScheduleDesc")}
      >
        <div className="configuration-actions">
          <AtlasButton type="button" variant="secondary" onClick={() => applyPreset("weekdays")}>
            {translate("appointmentsPresetWeekdays")}
          </AtlasButton>
        </div>
        <WorkingScheduleTimeline
          workingSchedule={appointmentProfile.workingSchedule}
          dayLabels={DAY_LABELS}
          onDayChange={updateDay}
          onBlockChange={updateDayBlock}
          onAddBlock={addDayBlock}
          onRemoveBlock={removeDayBlock}
        />
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsSettingsVirtual")}
        description={translate("appointmentsSettingsVirtualDesc")}
      >
        <div className="configuration-grid-2">
          <AtlasSelect
            label={translate("appointmentsPreferredProvider")}
            value={appointmentProfile.virtualMeeting.preferredProvider}
            options={VIRTUAL_PROVIDERS}
            onChange={(value) => updateVirtual("preferredProvider", value)}
          />
          <div className="appointment-settings__status-field">
            <span className="appointment-settings__field-label">
              {translate("appointmentsZoomStatus")}
            </span>
            <StatusBadge variant={zoomStatus.connected ? "success" : "neutral"}>
              {zoomStatus.connected
                ? translate("configurationConnected")
                : translate("configurationNotConnected")}
            </StatusBadge>
            <Link to={appPath("settings/integrations")} className="appointment-settings__link">
              {translate("appointmentsManageZoom")}
            </Link>
          </div>
        </div>
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsSettingsOffice")}
        description={translate("appointmentsSettingsOfficeDesc")}
      >
        {officeLocked ? (
          <p className="appointment-settings__note">
            {translate("appointmentsOfficeOrgSource")}
            {" "}
            <Link to={appPath("settings/organization")} className="appointment-settings__link">
              {translate("appointmentsManageOrganizationOffice")}
            </Link>
          </p>
        ) : (
          <p className="appointment-settings__note">
            {translate("appointmentsOfficeProfileSource")}
            {" "}
            <Link to={appPath("settings/organization")} className="appointment-settings__link">
              {translate("appointmentsManageOrganizationOffice")}
            </Link>
          </p>
        )}
        <div className="configuration-grid-2">
          <label>
            {translate("appointmentsOfficeName")}
            <input
              type="text"
              value={appointmentProfile.office.name}
              onChange={(event) => updateOffice("name", event.target.value)}
            />
          </label>
          <label>
            {translate("appointmentsOfficeAddress")}
            <input
              type="text"
              value={
                officeLocked
                  ? organizationOffice.address || appointmentProfile.office.address
                  : appointmentProfile.office.address
              }
              onChange={(event) => updateOffice("address", event.target.value)}
              readOnly={officeLocked}
              disabled={officeLocked}
            />
          </label>
          <label>
            {translate("appointmentsOfficeCity")}
            <input
              type="text"
              value={appointmentProfile.office.city}
              onChange={(event) => updateOffice("city", event.target.value)}
              readOnly={officeLocked}
              disabled={officeLocked}
            />
          </label>
          <label>
            {translate("appointmentsOfficeState")}
            <input
              type="text"
              value={appointmentProfile.office.state}
              onChange={(event) => updateOffice("state", event.target.value)}
              readOnly={officeLocked}
              disabled={officeLocked}
            />
          </label>
          <label>
            {translate("appointmentsOfficePostal")}
            <input
              type="text"
              value={appointmentProfile.office.postalCode}
              onChange={(event) => updateOffice("postalCode", event.target.value)}
              readOnly={officeLocked}
              disabled={officeLocked}
            />
          </label>
          <label>
            {translate("appointmentsOfficeParking")}
            <textarea
              rows={3}
              value={appointmentProfile.office.parkingNotes}
              onChange={(event) => updateOffice("parkingNotes", event.target.value)}
            />
          </label>
        </div>
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsFavoriteLocationsTitle")}
        description={translate("appointmentsFavoriteLocationsDesc")}
      >
        {locations.length === 0 ? (
          <EmptyState
            title={translate("appointmentsNoLocations")}
            actionLabel={translate("appointmentsAddLocation")}
            onAction={addLocation}
          />
        ) : (
          <div className="appointment-settings__locations">
            {locations.map((location, index) => {
              const editing = editingLocationId === location.id;
              return (
                <article key={location.id} className="appointment-location-card">
                  <div className="appointment-location-card__top">
                    <div>
                      <h3 className="appointment-location-card__name">
                        {location.name || translate("appointmentsLocationName")}
                      </h3>
                      <p className="appointment-location-card__address">
                        {formatLocationAddress(location) || translate("appointmentsOfficeAddress")}
                      </p>
                    </div>
                    {index === 0 ? (
                      <StatusBadge variant="info">{translate("appointmentsDefaultLocation")}</StatusBadge>
                    ) : null}
                  </div>
                  {editing ? (
                    <div className="configuration-grid-2">
                      <label>
                        {translate("appointmentsLocationName")}
                        <input
                          type="text"
                          value={location.name}
                          onChange={(event) =>
                            updateLocation(location.id, "name", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        {translate("appointmentsOfficeAddress")}
                        <input
                          type="text"
                          value={location.address}
                          onChange={(event) =>
                            updateLocation(location.id, "address", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        {translate("appointmentsOfficeCity")}
                        <input
                          type="text"
                          value={location.city}
                          onChange={(event) =>
                            updateLocation(location.id, "city", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        {translate("appointmentsOfficeState")}
                        <input
                          type="text"
                          value={location.state}
                          onChange={(event) =>
                            updateLocation(location.id, "state", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        {translate("appointmentsOfficePostal")}
                        <input
                          type="text"
                          value={location.postalCode}
                          onChange={(event) =>
                            updateLocation(location.id, "postalCode", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        {translate("appointmentsLocationNotes")}
                        <textarea
                          rows={2}
                          value={location.notes}
                          onChange={(event) =>
                            updateLocation(location.id, "notes", event.target.value)
                          }
                        />
                      </label>
                      {fieldErrors[`location-${location.id}`] ? (
                        <span className="appointment-settings__error">
                          {fieldErrors[`location-${location.id}`]}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="favorite-location-row__actions">
                    <AtlasButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setEditingLocationId(editing ? null : location.id)
                      }
                    >
                      {editing
                        ? translate("appointmentsDoneEditingLocation")
                        : translate("appointmentsEditLocation")}
                    </AtlasButton>
                    <AtlasButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => removeLocation(location.id)}
                    >
                      {translate("appointmentsDeleteLocation")}
                    </AtlasButton>
                  </div>
                </article>
              );
            })}
            <AtlasButton type="button" variant="secondary" onClick={addLocation}>
              {translate("appointmentsAddLocation")}
            </AtlasButton>
          </div>
        )}
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsSettingsCalendar")}
        description={translate("appointmentsSettingsCalendarDesc")}
      >
        <div className="appointment-settings__calendar-grid">
          <div className="appointment-settings__calendar-row">
            <span>{translate("configurationGoogleCalendar")}</span>
            <StatusBadge variant={calendarStatusVariant(calendarSources.google)}>
              {calendarStatusLabel(calendarSources.google, translate)}
            </StatusBadge>
          </div>
          {calendarSources.icloud.available ? (
            <div className="appointment-settings__calendar-row">
              <span>{translate("configurationIcloudCalendar")}</span>
              <StatusBadge variant={calendarStatusVariant(calendarSources.icloud)}>
                {calendarStatusLabel(calendarSources.icloud, translate)}
              </StatusBadge>
            </div>
          ) : null}
        </div>
        <Link to={appPath("settings/integrations")} className="appointment-settings__link">
          {translate("appointmentsManageCalendars")}
        </Link>
      </ConfigurationSection>

      {actionError ? (
        <AppointmentErrorCard
          compact
          title={actionError.title}
          body={actionError.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={actionError.retry}
        />
      ) : null}

      <div className="appointment-settings__save-bar">
        <AtlasButton type="submit" disabled={saving || !dirty}>
          {saving ? translate("configurationSaving") : translate("appointmentsSaveChanges")}
        </AtlasButton>
      </div>
    </form>
  );
}
