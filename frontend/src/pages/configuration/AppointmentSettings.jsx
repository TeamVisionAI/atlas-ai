import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import WorkingScheduleTimeline from "../../components/appointments/WorkingScheduleTimeline";
import AppointmentErrorCard from "../../components/appointments/AppointmentErrorCard";
import { captureAppointmentError } from "../../utils/appointmentErrors";
import { parseTimeToMinutes, minutesToTime } from "../../components/appointments/workingScheduleTimeUtils";
import { DAY_LABELS } from "../AppointmentsPage";
import {
  fetchAppointmentProfile,
  updateAppointmentProfile
} from "../../services/appointmentService";
import "../configuration/Configuration.css";

const VIRTUAL_PROVIDERS = [
  { id: "zoom", label: "Zoom" },
  { id: "whatsapp_video", label: "WhatsApp Video" },
  { id: "phone_call", label: "Phone Call" }
];

export default function AppointmentSettings() {
  const { translate } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [calendarConnection, setCalendarConnection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);

    try {
      const result = await fetchAppointmentProfile();
      setProfile(result.profile);
      setCalendarConnection(result.calendarConnection);
    } catch (requestError) {
      setLoadError(captureAppointmentError("settings_load", requestError, translate));
    }
  }, [translate]);

  useEffect(() => {
    load();
  }, [load]);

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
          blocks: [
            ...day.blocks,
            { start: minutesToTime(newStart), end: minutesToTime(newEnd) }
          ]
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
        favoritePublicLocations: current.appointmentProfile.favoritePublicLocations.map((location) =>
          location.id === id ? { ...location, [field]: value } : location
        )
      }
    }));
  }

  function addLocation() {
    setProfile((current) => ({
      ...current,
      appointmentProfile: {
        ...current.appointmentProfile,
        favoritePublicLocations: [
          ...current.appointmentProfile.favoritePublicLocations,
          {
            id: crypto.randomUUID(),
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
  }

  function moveLocation(id, direction) {
    setProfile((current) => {
      const locations = [...current.appointmentProfile.favoritePublicLocations];
      const index = locations.findIndex((location) => location.id === id);

      if (index < 0) {
        return current;
      }

      const target = direction === "up" ? index - 1 : index + 1;

      if (target < 0 || target >= locations.length) {
        return current;
      }

      [locations[index], locations[target]] = [locations[target], locations[index]];

      return {
        ...current,
        appointmentProfile: {
          ...current.appointmentProfile,
          favoritePublicLocations: locations
        }
      };
    });
  }

  async function persistProfile(payload) {
    setSaving(true);
    setActionError(null);
    setMessage("");

    try {
      const result = await updateAppointmentProfile(payload);
      setProfile(result.profile);
      setMessage(translate("configurationSaved"));
    } catch (requestError) {
      const copy = captureAppointmentError("settings_save", requestError, translate);
      setActionError({
        ...copy,
        retry: () => persistProfile(payload)
      });
    } finally {
      setSaving(false);
    }
  }

  async function applyPreset(preset) {
    await persistProfile({ schedulePreset: preset });
  }

  async function save(event) {
    event.preventDefault();

    if (!profile) {
      return;
    }

    await persistProfile({
      workingSchedule: profile.appointmentProfile.workingSchedule,
      defaults: profile.appointmentProfile.defaults,
      virtualMeeting: profile.appointmentProfile.virtualMeeting,
      office: profile.appointmentProfile.office,
      favoritePublicLocations: profile.appointmentProfile.favoritePublicLocations
    });
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

  return (
    <form className="configuration-sections" onSubmit={save}>
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
        title={translate("appointmentsSettingsDefaults")}
        description={translate("appointmentsSettingsDefaultsDesc")}
      >
        <label>
          {translate("appointmentsDefaultDuration")}
          <input
            type="number"
            min="15"
            step="15"
            value={appointmentProfile.defaults.defaultDurationMinutes}
            onChange={(event) =>
              updateDefaults("defaultDurationMinutes", Number(event.target.value))
            }
          />
        </label>
        <label>
          {translate("appointmentsRecruitingDuration")}
          <input
            type="number"
            min="15"
            step="15"
            value={appointmentProfile.defaults.recruitingInterviewDurationMinutes}
            onChange={(event) =>
              updateDefaults("recruitingInterviewDurationMinutes", Number(event.target.value))
            }
          />
        </label>
        <label>
          {translate("appointmentsBufferBefore")}
          <input
            type="number"
            min="0"
            step="5"
            value={appointmentProfile.defaults.bufferBeforeMinutes}
            onChange={(event) => updateDefaults("bufferBeforeMinutes", Number(event.target.value))}
          />
        </label>
        <label>
          {translate("appointmentsBufferAfter")}
          <input
            type="number"
            min="0"
            step="5"
            value={appointmentProfile.defaults.bufferAfterMinutes}
            onChange={(event) => updateDefaults("bufferAfterMinutes", Number(event.target.value))}
          />
        </label>
        <label>
          {translate("configurationTimezone")}
          <input
            type="text"
            value={appointmentProfile.defaults.timezone}
            onChange={(event) => updateDefaults("timezone", event.target.value)}
          />
        </label>
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsSettingsVirtual")}
        description={translate("appointmentsSettingsVirtualDesc")}
      >
        <label>
          {translate("appointmentsPreferredProvider")}
          <select
            value={appointmentProfile.virtualMeeting.preferredProvider}
            onChange={(event) => updateVirtual("preferredProvider", event.target.value)}
          >
            {VIRTUAL_PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsSettingsOffice")}
        description={translate("appointmentsSettingsOfficeDesc")}
      >
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
            value={appointmentProfile.office.address}
            onChange={(event) => updateOffice("address", event.target.value)}
          />
        </label>
        <label>
          {translate("appointmentsOfficeCity")}
          <input
            type="text"
            value={appointmentProfile.office.city}
            onChange={(event) => updateOffice("city", event.target.value)}
          />
        </label>
        <label>
          {translate("appointmentsOfficeState")}
          <input
            type="text"
            value={appointmentProfile.office.state}
            onChange={(event) => updateOffice("state", event.target.value)}
          />
        </label>
        <label>
          {translate("appointmentsOfficePostal")}
          <input
            type="text"
            value={appointmentProfile.office.postalCode}
            onChange={(event) => updateOffice("postalCode", event.target.value)}
          />
        </label>
        <label>
          {translate("appointmentsOfficeParking")}
          <textarea
            value={appointmentProfile.office.parkingNotes}
            onChange={(event) => updateOffice("parkingNotes", event.target.value)}
          />
        </label>
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsFavoriteLocationsTitle")}
        description={translate("appointmentsFavoriteLocationsDesc")}
      >
        <div className="configuration-actions">
          <AtlasButton type="button" variant="secondary" onClick={addLocation}>
            {translate("appointmentsAddLocation")}
          </AtlasButton>
        </div>
        {appointmentProfile.favoritePublicLocations.length === 0 ? (
          <p className="appointment-modal__hint">{translate("appointmentsNoLocations")}</p>
        ) : null}
        {appointmentProfile.favoritePublicLocations.map((location, index) => (
          <div key={location.id} className="favorite-location-row">
            <label>
              {translate("appointmentsLocationName")}
              <input
                type="text"
                value={location.name}
                onChange={(event) => updateLocation(location.id, "name", event.target.value)}
              />
            </label>
            <label>
              {translate("appointmentsOfficeAddress")}
              <input
                type="text"
                value={location.address}
                onChange={(event) => updateLocation(location.id, "address", event.target.value)}
              />
            </label>
            <label>
              {translate("appointmentsOfficeCity")}
              <input
                type="text"
                value={location.city}
                onChange={(event) => updateLocation(location.id, "city", event.target.value)}
              />
            </label>
            <label>
              {translate("appointmentsLocationNotes")}
              <textarea
                rows={2}
                value={location.notes}
                onChange={(event) => updateLocation(location.id, "notes", event.target.value)}
              />
            </label>
            <div className="favorite-location-row__actions">
              <AtlasButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={index === 0}
                onClick={() => moveLocation(location.id, "up")}
              >
                {translate("appointmentsMoveUp")}
              </AtlasButton>
              <AtlasButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={index === appointmentProfile.favoritePublicLocations.length - 1}
                onClick={() => moveLocation(location.id, "down")}
              >
                {translate("appointmentsMoveDown")}
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
          </div>
        ))}
      </ConfigurationSection>

      <ConfigurationSection
        title={translate("appointmentsSettingsCalendar")}
        description={translate("appointmentsSettingsCalendarDesc")}
      >
        <p>
          {translate("appointmentsCalendarStatus")}:{" "}
          <strong>{calendarConnection?.connected ? translate("configurationConnected") : translate("configurationDisconnected")}</strong>
        </p>
        {calendarConnection?.googleAccountEmail ? (
          <p>{calendarConnection.googleAccountEmail}</p>
        ) : null}
      </ConfigurationSection>

      {message ? <p className="configuration-message">{message}</p> : null}
      {actionError ? (
        <AppointmentErrorCard
          compact
          title={actionError.title}
          body={actionError.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={actionError.retry}
        />
      ) : null}

      <AtlasButton type="submit" disabled={saving}>
        {saving ? translate("configurationSaving") : translate("configurationSave")}
      </AtlasButton>
    </form>
  );
}
