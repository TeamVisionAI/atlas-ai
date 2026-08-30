import { useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { createAgendaAppointment } from "../../services/agendaService";
import "./NewAgendaAppointmentDialog.css";

const COPY = {
  en: {
    title: "Add to Agenda",
    subtitle: "Schedule someone without adding them to Recruit AI.",
    name: "Name",
    phone: "Phone (optional)",
    email: "Email (optional)",
    type: "Meeting type",
    training: "Training",
    warm_market: "Warm market",
    orientation: "Orientation",
    client_service: "Client service",
    other: "Other",
    date: "Date",
    time: "Time",
    format: "How are you meeting?",
    virtual: "Zoom / virtual",
    in_person: "In person",
    phone_call: "Phone",
    notes: "Notes (optional)",
    language: "Preferred language (optional)",
    languageEnglish: "English",
    languageSpanish: "Spanish",
    source: "Source (optional)",
    cancel: "Cancel",
    save: "Add to Agenda",
    saving: "Scheduling…",
    unavailable: "That time is not available. Choose another time.",
    genericError: "Could not add this meeting to the Agenda."
  },
  es: {
    title: "Agregar a la Agenda",
    subtitle: "Agenda a una persona sin agregarla todavía a Recruit AI.",
    name: "Nombre",
    phone: "Teléfono (opcional)",
    email: "Correo (opcional)",
    type: "Tipo de cita",
    training: "Entrenamiento",
    warm_market: "Mercado cálido",
    orientation: "Orientación",
    client_service: "Servicio al cliente",
    other: "Otro",
    date: "Fecha",
    time: "Hora",
    format: "¿Cómo se van a reunir?",
    virtual: "Zoom / virtual",
    in_person: "En persona",
    phone_call: "Teléfono",
    notes: "Notas (opcional)",
    language: "Idioma preferido (opcional)",
    languageEnglish: "Inglés",
    languageSpanish: "Español",
    source: "Origen (opcional)",
    cancel: "Cancelar",
    save: "Agregar a la Agenda",
    saving: "Agendando…",
    unavailable: "Ese horario no está disponible. Selecciona otra hora.",
    genericError: "No se pudo agregar esta cita a la Agenda."
  }
};

function initialDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function purposeForKind(kind) {
  if (kind === "training") return "training";
  if (kind === "client_service") return "client_service";
  return "other";
}

export default function NewAgendaAppointmentDialog({ open, onClose, onCreated }) {
  const { locale } = useLanguage();
  const lang = String(locale || "").toLowerCase().startsWith("es") ? "es" : "en";
  const copy = COPY[lang];
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    agendaKind: "training",
    dateKey: initialDate(),
    timeKey: "10:00",
    meetingType: "virtual",
    notes: "",
    preferredLanguage: "",
    source: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const minDate = useMemo(initialDate, []);

  if (!open) return null;

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.dateKey || !form.timeKey) return;
    setSaving(true);
    setError("");
    try {
      const result = await createAgendaAppointment({
        contact: {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          preferredLanguage: form.preferredLanguage || null,
          source: form.source.trim() || null,
          notes: form.notes.trim() || null
        },
        agendaKind: form.agendaKind,
        purpose: purposeForKind(form.agendaKind),
        dateKey: form.dateKey,
        timeKey: form.timeKey,
        meetingType: form.meetingType,
        notes: form.notes.trim() || null
      });
      await onCreated?.(result);
      setForm((current) => ({
        ...current,
        name: "",
        phone: "",
        email: "",
        notes: "",
        preferredLanguage: "",
        source: ""
      }));
      onClose?.();
    } catch (requestError) {
      setError(
        requestError?.code === "UNAVAILABLE" || requestError?.message?.toLowerCase().includes("available")
          ? copy.unavailable
          : requestError?.message || copy.genericError
      );
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
        aria-labelledby="agenda-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="agenda-dialog__header">
          <div>
            <h2 id="agenda-dialog-title">{copy.title}</h2>
            <p>{copy.subtitle}</p>
          </div>
          <button type="button" className="agenda-dialog__close" onClick={onClose} aria-label={copy.cancel}>×</button>
        </header>

        <form className="agenda-dialog__form" onSubmit={submit}>
          <label>
            <span>{copy.name}</span>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} required autoFocus />
          </label>
          <div className="agenda-dialog__two">
            <label>
              <span>{copy.phone}</span>
              <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </label>
            <label>
              <span>{copy.email}</span>
              <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </label>
          </div>
          <label>
            <span>{copy.type}</span>
            <select value={form.agendaKind} onChange={(e) => update("agendaKind", e.target.value)}>
              {["training", "warm_market", "orientation", "client_service", "other"].map((value) => (
                <option key={value} value={value}>{copy[value]}</option>
              ))}
            </select>
          </label>
          <div className="agenda-dialog__two">
            <label>
              <span>{copy.date}</span>
              <input type="date" min={minDate} value={form.dateKey} onChange={(e) => update("dateKey", e.target.value)} required />
            </label>
            <label>
              <span>{copy.time}</span>
              <input type="time" step="1800" value={form.timeKey} onChange={(e) => update("timeKey", e.target.value)} required />
            </label>
          </div>
          <label>
            <span>{copy.format}</span>
            <select value={form.meetingType} onChange={(e) => update("meetingType", e.target.value)}>
              <option value="virtual">{copy.virtual}</option>
              <option value="in_person">{copy.in_person}</option>
              <option value="phone">{copy.phone_call}</option>
            </select>
          </label>
          <div className="agenda-dialog__two">
            <label>
              <span>{copy.language}</span>
              <select value={form.preferredLanguage} onChange={(e) => update("preferredLanguage", e.target.value)}>
                <option value=""></option>
                <option value="english">{copy.languageEnglish}</option>
                <option value="spanish">{copy.languageSpanish}</option>
              </select>
            </label>
            <label>
              <span>{copy.source}</span>
              <input value={form.source} onChange={(e) => update("source", e.target.value)} />
            </label>
          </div>
          <label>
            <span>{copy.notes}</span>
            <textarea rows="3" value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </label>

          {error ? <p className="agenda-dialog__error" role="alert">{error}</p> : null}

          <footer className="agenda-dialog__actions">
            <button type="button" className="agenda-dialog__button agenda-dialog__button--secondary" onClick={onClose} disabled={saving}>{copy.cancel}</button>
            <button type="submit" className="agenda-dialog__button agenda-dialog__button--primary" disabled={saving || !form.name.trim()}>{saving ? copy.saving : copy.save}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
