import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/public/Navbar";
import Footer from "../components/public/Footer";
import PrimaryButton from "../components/public/PrimaryButton";
import { usePageMeta } from "../hooks/usePageMeta";
import {
  ATLAS_CONTACT_TOPICS,
  SUPPORT_FALLBACK_EMAIL,
  submitContactForm,
  validateAtlasContactFormFields
} from "../services/contactFormService";
import "./PublicSite.css";
import "../components/public/PublicSection.css";
import "./AtlasContact.css";

const INITIAL_FORM = {
  name: "",
  email: "",
  organization: "",
  topic: "",
  message: "",
  website: ""
};

const SUCCESS_MESSAGE =
  "Thanks — your message has been received. Our support team will get back to you as soon as possible.";

export default function AtlasContact() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const isSubmitting = status === "submitting";
  const supportMailto = `mailto:${SUPPORT_FALLBACK_EMAIL}`;

  usePageMeta({
    title: "Contact / Support | Atlas AI",
    description:
      "Contact Atlas AI support for account access, technical help, Google Calendar, WhatsApp, or billing questions."
  });

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));

    if (fieldErrors[name]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const errors = validateAtlasContactFormFields(form);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus("error");
      setStatusMessage("Please correct the highlighted fields and try again.");
      return;
    }

    setFieldErrors({});
    setStatus("submitting");
    setStatusMessage("");

    try {
      await submitContactForm({
        source: "atlas",
        name: form.name,
        email: form.email,
        organization: form.organization,
        topic: form.topic,
        message: form.message,
        website: form.website
      });
      setForm(INITIAL_FORM);
      setStatus("success");
      setStatusMessage(SUCCESS_MESSAGE);
    } catch (error) {
      if (error.validationErrors) {
        setFieldErrors(error.validationErrors);
        setStatus("error");
        setStatusMessage("Please correct the highlighted fields and try again.");
        return;
      }

      setStatus("error");
      setStatusMessage(
        error.message ||
          `We couldn't send your message. Please try again or email ${SUPPORT_FALLBACK_EMAIL}.`
      );
    }
  }

  return (
    <div className="public-site atlas-contact-page">
      <Navbar />
      <main id="main-content" className="public-site__legal">
        <div className="public-site__container atlas-contact">
          <header className="atlas-contact__header">
            <p className="public-site__eyebrow">Atlas AI</p>
            <h1>Contact / Support</h1>
            <p className="public-site__lead">
              Send a message to the Atlas support team. We typically respond as soon as possible
              during business hours.
            </p>
            <p className="atlas-contact__fallback">
              Prefer email?{" "}
              <a href={supportMailto}>{SUPPORT_FALLBACK_EMAIL}</a>
            </p>
          </header>

          <form
            className="public-section__form atlas-contact__form"
            aria-label="Atlas contact and support form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="public-section__field">
              <label htmlFor="atlas-contact-name">Name</label>
              <input
                id="atlas-contact-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={form.name}
                onChange={updateField}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "atlas-contact-name-error" : undefined}
              />
              {fieldErrors.name ? (
                <span id="atlas-contact-name-error" className="public-section__form-note">
                  {fieldErrors.name}
                </span>
              ) : null}
            </div>

            <div className="public-section__field">
              <label htmlFor="atlas-contact-email">Email</label>
              <input
                id="atlas-contact-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={updateField}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "atlas-contact-email-error" : undefined}
              />
              {fieldErrors.email ? (
                <span id="atlas-contact-email-error" className="public-section__form-note">
                  {fieldErrors.email}
                </span>
              ) : null}
            </div>

            <div className="public-section__field">
              <label htmlFor="atlas-contact-organization">
                Organization <span className="atlas-contact__optional">(optional)</span>
              </label>
              <input
                id="atlas-contact-organization"
                name="organization"
                type="text"
                autoComplete="organization"
                value={form.organization}
                onChange={updateField}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.organization)}
                aria-describedby={
                  fieldErrors.organization ? "atlas-contact-organization-error" : undefined
                }
              />
              {fieldErrors.organization ? (
                <span
                  id="atlas-contact-organization-error"
                  className="public-section__form-note"
                >
                  {fieldErrors.organization}
                </span>
              ) : null}
            </div>

            <div className="public-section__field">
              <label htmlFor="atlas-contact-topic">Topic</label>
              <select
                id="atlas-contact-topic"
                name="topic"
                required
                value={form.topic}
                onChange={updateField}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.topic)}
                aria-describedby={fieldErrors.topic ? "atlas-contact-topic-error" : undefined}
              >
                <option value="">Select a topic</option>
                {ATLAS_CONTACT_TOPICS.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
              {fieldErrors.topic ? (
                <span id="atlas-contact-topic-error" className="public-section__form-note">
                  {fieldErrors.topic}
                </span>
              ) : null}
            </div>

            <div className="public-section__field">
              <label htmlFor="atlas-contact-message">Message</label>
              <textarea
                id="atlas-contact-message"
                name="message"
                rows={6}
                required
                value={form.message}
                onChange={updateField}
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.message)}
                aria-describedby={
                  fieldErrors.message ? "atlas-contact-message-error" : undefined
                }
              />
              {fieldErrors.message ? (
                <span id="atlas-contact-message-error" className="public-section__form-note">
                  {fieldErrors.message}
                </span>
              ) : null}
            </div>

            <div
              aria-hidden="true"
              className="atlas-contact__honeypot"
            >
              <label htmlFor="atlas-contact-website">Website</label>
              <input
                id="atlas-contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={updateField}
              />
            </div>

            <PrimaryButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send message"}
            </PrimaryButton>

            <p className="atlas-contact__privacy">
              By submitting this form, you agree that Atlas may use the information provided to
              respond to your request. See our <Link to="/privacy">Privacy</Link> policy.
            </p>

            {statusMessage ? (
              <p
                className={`public-section__form-note atlas-contact__status atlas-contact__status--${status}`}
                role={status === "success" ? "status" : "alert"}
              >
                {statusMessage}
              </p>
            ) : null}
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
