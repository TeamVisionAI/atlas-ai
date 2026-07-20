import { useState } from "react";
import "./PublicSection.css";
import PrimaryButton from "./PrimaryButton";
import {
  submitContactForm,
  validateContactFormFields,
} from "../../services/contactFormService";

const INITIAL_FORM = {
  name: "",
  email: "",
  message: "",
  website: "",
};

export default function Contact() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const isSubmitting = status === "submitting";

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

    const errors = validateContactFormFields(form);

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
      await submitContactForm(form);
      setForm(INITIAL_FORM);
      setStatus("success");
      setStatusMessage(
        "Thank you for your message. A Team Vision Financial representative will respond during business hours."
      );
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
          "We couldn't send your message. Please try again or call (786) 752-8080."
      );
    }
  }

  return (
    <section
      id="contact"
      className="public-site__section public-section"
      aria-labelledby="contact-heading"
    >
      <div className="public-site__container public-section__grid">
        <div>
          <p className="public-site__eyebrow">Get in touch</p>
          <h2 id="contact-heading" className="public-site__title">
            Contact
          </h2>
          <p className="public-section__text">
            Schedule a consultation or send us a message about life insurance, retirement planning,
            or career opportunities. A Team Vision Financial representative will respond during
            business hours.
          </p>

          <dl className="public-section__contact-list">
            <div>
              <dt>Email</dt>
              <dd>
                {/* TODO: Replace with official company contact email before production launch. */}
                <a href="mailto:info@teamvisionfinancial.com">info@teamvisionfinancial.com</a>
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                <a href="tel:+17867528080">(786) 752-8080</a>
              </dd>
            </div>
            <div>
              <dt>Office</dt>
              <dd>
                {/* TODO: Replace with verified business address for Meta Business Verification. */}
                Miami, Florida
              </dd>
            </div>
          </dl>
        </div>

        <form
          className="public-section__form"
          aria-label="Contact form"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="public-section__field">
            <label htmlFor="contact-name">Full name</label>
            <input
              id="contact-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={form.name}
              onChange={updateField}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
            />
            {fieldErrors.name ? (
              <span id="contact-name-error" className="public-section__form-note">
                {fieldErrors.name}
              </span>
            ) : null}
          </div>
          <div className="public-section__field">
            <label htmlFor="contact-email">Email</label>
            <input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={updateField}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
            />
            {fieldErrors.email ? (
              <span id="contact-email-error" className="public-section__form-note">
                {fieldErrors.email}
              </span>
            ) : null}
          </div>
          <div className="public-section__field">
            <label htmlFor="contact-message">Message</label>
            <textarea
              id="contact-message"
              name="message"
              rows={5}
              required
              value={form.message}
              onChange={updateField}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.message)}
              aria-describedby={fieldErrors.message ? "contact-message-error" : undefined}
            />
            {fieldErrors.message ? (
              <span id="contact-message-error" className="public-section__form-note">
                {fieldErrors.message}
              </span>
            ) : null}
          </div>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-9999px",
              width: "1px",
              height: "1px",
              overflow: "hidden",
            }}
          >
            <label htmlFor="contact-website">Website</label>
            <input
              id="contact-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={updateField}
            />
          </div>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            Send message
          </PrimaryButton>
          {statusMessage ? (
            <p
              className="public-section__form-note"
              role={status === "success" ? "status" : "alert"}
            >
              {statusMessage}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
