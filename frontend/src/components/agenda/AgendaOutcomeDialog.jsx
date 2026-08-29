import { useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { recordAgendaOutcome } from "../../services/agendaService";
import "./NewAgendaAppointmentDialog.css";

const COPY = {
  en: {
    title: "Record meeting outcome",
    subtitle: "This does not create a recruit or client yet.",
    outcome: "Outcome",
    recruited: "Recruited",
    client: "Became client",
    follow_up: "Follow-up",
    no_show: "No-show / excuse",
    not_interested: "Not interested",
    other: "Other",
    notes: "Outcome notes (optional)",
    cancel: "Cancel",
    save: "Save outcome",
    saving: "Saving…",
    error: "Could not save this outcome."
  },
  es: {
    title: "Registrar resultado de la cita",
    subtitle: "Esto todavía no crea un recluta ni un cliente.",
    outcome: "Resultado",
    recruited: "Reclutado",
    client: "Se convirtió en cliente",
    follow_up: "Seguimiento",
    no_show: "No llegó / excusa",
    not_interested: "No interesado",
    other: "Otro",
    notes: "Notas del resultado (opcional)",
    cancel: "Cancelar",
    save: "Guardar resultado",
    saving: "Guardando…",
    error: "No se pudo guardar este resultado."
  }
};

const OUTCOMES = ["recruited", "client", "follow_up", "no_show", "not_interested", "other"];

export default function AgendaOutcomeDialog({ open, appointment, onClose, onSuccess }) {
  const { locale } = useLanguage();
  const lang = String(locale || "").toLowerCase().startsWith("es") ? "es" : "en";
  const copy = COPY[lang];
  const [outcome, setOutcome] = useState("follow_up");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open || !appointment) return null;

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await recordAgendaOutcome(appointment.id, {
        outcome,
        outcomeNotes: notes.trim() || null
      });
      await onSuccess?.(result?.appointment || null, outcome);
      setOutcome("follow_up");
      setNotes("");
      onClose?.();
    } catch (requestError) {
      setError(requestError?.message || copy.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="agenda-dialog__backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="agenda-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agenda-outcome-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="agenda-dialog__header">
          <div>
            <h2 id="agenda-outcome-title">{copy.title}</h2>
            <p>{copy.subtitle}</p>
          </div>
          <button type="button" className="agenda-dialog__close" onClick={onClose} aria-label={copy.cancel}>×</button>
        </header>

        <form className="agenda-dialog__form" onSubmit={submit}>
          <label>
            <span>{copy.outcome}</span>
            <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
              {OUTCOMES.map((value) => (
                <option key={value} value={value}>{copy[value]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.notes}</span>
            <textarea rows="4" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          {error ? <p className="agenda-dialog__error" role="alert">{error}</p> : null}

          <footer className="agenda-dialog__actions">
            <button type="button" className="agenda-dialog__button agenda-dialog__button--secondary" onClick={onClose} disabled={saving}>{copy.cancel}</button>
            <button type="submit" className="agenda-dialog__button agenda-dialog__button--primary" disabled={saving}>{saving ? copy.saving : copy.save}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
