import { Link } from "react-router-dom";
import "./Onboarding.css";

export default function OnboardingLayout({ step, title, subtitle, children, footer = null }) {
  return (
    <div className="onboarding-page">
      <div className="onboarding-shell">
        <div className="onboarding-brand">Atlas</div>

        {typeof step === "number" ? (
          <div className="onboarding-progress" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <span
                key={index}
                className={`onboarding-progress__dot${index < step ? " is-active" : ""}`}
              />
            ))}
          </div>
        ) : null}

        <div className="onboarding-card">
          {title ? <h1 className="onboarding-title">{title}</h1> : null}
          {subtitle ? <p className="onboarding-subtitle">{subtitle}</p> : null}
          <div className="onboarding-content">{children}</div>
        </div>

        {footer ? <div className="onboarding-footer">{footer}</div> : null}

        <Link to="/" className="onboarding-home-link">
          Back to website
        </Link>
      </div>
    </div>
  );
}

export function OnboardingButton({
  children,
  type = "button",
  variant = "primary",
  disabled = false,
  onClick,
  to,
  className = ""
}) {
  const classes = `onboarding-button onboarding-button--${variant} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function OnboardingField({ label, children, hint = null }) {
  return (
    <label className="onboarding-field">
      <span className="onboarding-field__label">{label}</span>
      {children}
      {hint ? <span className="onboarding-field__hint">{hint}</span> : null}
    </label>
  );
}

export function OnboardingInput(props) {
  return <input className="onboarding-input" {...props} />;
}

export function OnboardingCheckbox({ label, checked, onChange }) {
  return (
    <label className="onboarding-checkbox">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

export function OnboardingError({ message }) {
  if (!message) {
    return null;
  }

  return <p className="onboarding-error">{message}</p>;
}
