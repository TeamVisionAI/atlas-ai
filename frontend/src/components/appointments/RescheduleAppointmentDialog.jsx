import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AppointmentModalShell, { AppointmentModalActions } from "./AppointmentModalShell";
import AppointmentErrorCard from "./AppointmentErrorCard";
import {
  fetchAppointmentAvailability,
  rescheduleAppointment
} from "../../services/appointmentService";
import { captureAppointmentError } from "../../utils/appointmentErrors";
import {
  formatSchedulingDayLabel,
  formatSlotButtonLabel
} from "../../utils/schedulingSlotGroups";

const REASONS = [
  "prospect_requested",
  "agent_requested",
  "technical_issue",
  "no_show",
  "emergency",
  "other"
];

export default function RescheduleAppointmentDialog({ open, appointment, onClose, onSuccess }) {
  const { translate, language } = useLanguage();
  const locale = language === "es" ? "es-ES" : "en-US";
  const [step, setStep] = useState("reason");
  const [reason, setReason] = useState("agent_requested");
  const [dateKey, setDateKey] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setStep("reason");
      setReason("agent_requested");
      setDateKey("");
      setSlots([]);
      setSelectedSlot(null);
      setError(null);
    }
  }, [open]);

  const loadSlots = useCallback(async () => {
    if (!dateKey || !appointment) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchAppointmentAvailability({
        date: dateKey,
        purpose: appointment.purpose,
        duration: appointment.durationMinutes
      });
      setSlots(result.slots || []);
    } catch (requestError) {
      setSlots([]);
      setError(captureAppointmentError("availability", requestError, translate));
    } finally {
      setLoading(false);
    }
  }, [appointment, dateKey, translate]);

  useEffect(() => {
    if (!open || step !== "slots" || !dateKey) {
      return;
    }

    loadSlots();
  }, [open, step, dateKey, loadSlots]);

  async function submitReschedule() {
    if (!selectedSlot || !appointment) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await rescheduleAppointment(appointment.id, {
        reason,
        dateKey: selectedSlot.dateKey,
        timeKey: selectedSlot.timeKey
      });
      setStep("success");
      onSuccess?.();
    } catch (requestError) {
      setError(captureAppointmentError("reschedule", requestError, translate));
    } finally {
      setLoading(false);
    }
  }

  function retryError() {
    if (step === "slots" && dateKey) {
      loadSlots();
      return;
    }

    if (step === "confirm") {
      submitReschedule();
    }
  }

  function renderBody() {
    if (step === "reason") {
      return (
        <div className="appointment-form">
          <label htmlFor="reschedule-reason">{translate("appointmentsRescheduleReasonLabel")}</label>
          <select
            id="reschedule-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            {REASONS.map((value) => (
              <option key={value} value={value}>
                {translate(`appointmentsRescheduleReason_${value}`)}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (step === "slots") {
      return (
        <div className="appointment-form">
          <label htmlFor="reschedule-date">{translate("appointmentsRescheduleDateLabel")}</label>
          <input
            id="reschedule-date"
            type="date"
            value={dateKey}
            onChange={(event) => {
              setDateKey(event.target.value);
              setSelectedSlot(null);
              setError(null);
            }}
          />
          {loading ? <p className="appointment-modal__hint">{translate("loading")}</p> : null}
          {!loading && !error && slots.length ? (
            <div className="appointment-slot-grid" role="listbox" aria-label={translate("appointmentsAvailableSlots")}>
              {slots.map((slot) => (
                <button
                  key={`${slot.dateKey}-${slot.timeKey}`}
                  type="button"
                  role="option"
                  aria-selected={selectedSlot?.timeKey === slot.timeKey}
                  className={`appointment-slot${selectedSlot?.timeKey === slot.timeKey ? " appointment-slot--selected" : ""}`}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {formatSlotButtonLabel(slot, locale)}
                </button>
              ))}
            </div>
          ) : null}
          {!loading && !error && dateKey && !slots.length ? (
            <p className="appointment-modal__hint">{translate("appointmentsNoSlots")}</p>
          ) : null}
        </div>
      );
    }

    if (step === "confirm") {
      return (
        <div className="appointment-form">
          <p>{translate("appointmentsRescheduleConfirmBody")}</p>
          <ul className="appointment-confirm-list">
            <li>
              <strong>{translate("appointmentsRescheduleReasonLabel")}:</strong>{" "}
              {translate(`appointmentsRescheduleReason_${reason}`)}
            </li>
            <li>
              <strong>{translate("appointmentsWhen")}:</strong>{" "}
              {formatSchedulingDayLabel(selectedSlot?.dateKey, new Date(), { translate, locale })}{" "}
              {formatSlotButtonLabel(selectedSlot, locale)}
            </li>
          </ul>
        </div>
      );
    }

    return <p className="appointment-modal__success">{translate("appointmentsRescheduled")}</p>;
  }

  function renderFooter() {
    if (step === "success") {
      return (
        <AppointmentModalActions
          cancelLabel={translate("appointmentsClose")}
          confirmLabel={translate("appointmentsClose")}
          onCancel={onClose}
          onConfirm={onClose}
        />
      );
    }

    if (step === "reason") {
      return (
        <AppointmentModalActions
          cancelLabel={translate("appointmentsCancelAction")}
          confirmLabel={translate("appointmentsContinue")}
          onCancel={onClose}
          onConfirm={() => setStep("slots")}
        />
      );
    }

    if (step === "slots") {
      return (
        <AppointmentModalActions
          cancelLabel={translate("appointmentsBack")}
          confirmLabel={translate("appointmentsContinue")}
          confirmDisabled={!selectedSlot || Boolean(error)}
          onCancel={() => setStep("reason")}
          onConfirm={() => setStep("confirm")}
        />
      );
    }

    return (
      <AppointmentModalActions
        cancelLabel={translate("appointmentsBack")}
        confirmLabel={translate("appointmentsConfirmReschedule")}
        loading={loading}
        onCancel={() => setStep("slots")}
        onConfirm={submitReschedule}
      />
    );
  }

  return (
    <AppointmentModalShell
      open={open}
      title={translate("appointmentsReschedule")}
      onClose={onClose}
      footer={renderFooter()}
      wide
    >
      {error ? (
        <AppointmentErrorCard
          compact
          title={error.title}
          body={error.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={retryError}
        />
      ) : null}
      {renderBody()}
    </AppointmentModalShell>
  );
}
