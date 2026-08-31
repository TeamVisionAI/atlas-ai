import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import AppointmentModalShell, { AppointmentModalActions } from "../appointments/AppointmentModalShell";
import AppointmentErrorCard from "../appointments/AppointmentErrorCard";
import { completeAgendaClientConversion } from "../../services/agendaService";
import { captureAppointmentError } from "../../utils/appointmentErrors";
import { PRODUCTION_ACTIVITY_TYPES, buildProductionTypeLabel } from "../../engines/productionViewModel";

export default function ClientConversionPremiumDialog({
  open,
  appointment,
  onClose,
  onSuccess
}) {
  const { translate } = useLanguage();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [productionDate, setProductionDate] = useState("");
  const [activityType, setActivityType] = useState(PRODUCTION_ACTIVITY_TYPES.LIFE);
  const [carrier, setCarrier] = useState("");
  const [productType, setProductType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setAmount("");
      setCurrency("USD");
      setProductionDate(new Date().toISOString().slice(0, 10));
      setActivityType(PRODUCTION_ACTIVITY_TYPES.LIFE);
      setCarrier("");
      setProductType("");
      setError(null);
    }
  }, [open]);

  const contactName =
    appointment?.metadata?.agendaContactName ||
    appointment?.prospectName ||
    translate("agendaUnknownContact");

  async function submitPremium() {
    if (!appointment) return;
    setLoading(true);
    setError(null);
    try {
      const result = await completeAgendaClientConversion(appointment.id, {
        amount,
        currency,
        productionDate: productionDate || undefined,
        activityType,
        carrier: carrier || undefined,
        productType: productType || undefined
      });
      onSuccess?.(result);
      onClose();
    } catch (requestError) {
      setError(captureAppointmentError("complete", requestError, translate));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppointmentModalShell
      open={open}
      title={translate("agendaClientPremiumTitle")}
      onClose={onClose}
      footer={
        <AppointmentModalActions
          cancelLabel={translate("appointmentsCancelAction")}
          confirmLabel={translate("agendaClientPremiumConfirm")}
          loading={loading}
          onCancel={onClose}
          onConfirm={submitPremium}
        />
      }
    >
      {error ? (
        <AppointmentErrorCard
          compact
          title={error.title}
          body={error.body}
          retryLabel={translate("appointmentsRetry")}
          onRetry={submitPremium}
        />
      ) : null}
      <p>{translate("agendaClientPremiumBody").replace("{name}", contactName)}</p>
      <label htmlFor="client-premium-amount">{translate("agendaClientPremiumAmount")}</label>
      <input
        id="client-premium-amount"
        type="number"
        min="0"
        step="0.01"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        required
      />
      <label htmlFor="client-premium-currency">{translate("agendaClientPremiumCurrency")}</label>
      <input
        id="client-premium-currency"
        value={currency}
        onChange={(event) => setCurrency(event.target.value.toUpperCase())}
        maxLength={3}
      />
      <label htmlFor="client-premium-date">{translate("agendaClientPremiumDate")}</label>
      <input
        id="client-premium-date"
        type="date"
        value={productionDate}
        onChange={(event) => setProductionDate(event.target.value)}
      />
      <label htmlFor="client-premium-type">{translate("productionType")}</label>
      <select
        id="client-premium-type"
        value={activityType}
        onChange={(event) => setActivityType(event.target.value)}
      >
        {Object.values(PRODUCTION_ACTIVITY_TYPES).map((type) => (
          <option key={type} value={type}>
            {buildProductionTypeLabel(type, translate)}
          </option>
        ))}
      </select>
      <label htmlFor="client-premium-carrier">{translate("productionCarrier")}</label>
      <input
        id="client-premium-carrier"
        value={carrier}
        onChange={(event) => setCarrier(event.target.value)}
      />
      <label htmlFor="client-premium-product">{translate("productionProduct")}</label>
      <input
        id="client-premium-product"
        value={productType}
        onChange={(event) => setProductType(event.target.value)}
      />
    </AppointmentModalShell>
  );
}
