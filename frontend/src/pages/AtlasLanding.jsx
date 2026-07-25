import { Link } from "react-router-dom";
import Navbar from "../components/public/Navbar";
import PrimaryButton from "../components/public/PrimaryButton";
import { usePageMeta } from "../hooks/usePageMeta";
import "./PublicSite.css";
import "./AtlasLanding.css";

const FEATURES = [
  {
    title: "WhatsApp Business Integration",
    description: "Secure Embedded Signup and official Meta integration.",
    icon: "whatsapp"
  },
  {
    title: "AI Conversation Automation",
    description: "Automatically qualify prospects and guide conversations.",
    icon: "automation"
  },
  {
    title: "Prospect Management",
    description: "Organize leads, conversations, and customer history.",
    icon: "prospects"
  },
  {
    title: "Appointment Scheduling",
    description: "Schedule meetings and follow-ups with integrated workflows.",
    icon: "calendar"
  },
  {
    title: "Executive Dashboard",
    description: "Real-time visibility into business activity and performance.",
    icon: "dashboard"
  },
  {
    title: "Multi-Tenant Architecture",
    description: "Each organization securely manages its own workspace and data.",
    icon: "tenant"
  }
];

const BENEFITS = [
  "Reduce response times",
  "Improve customer engagement",
  "Automate repetitive conversations",
  "Organize prospects in one platform",
  "Increase operational efficiency"
];

function FeatureIcon({ name }) {
  const icons = {
    whatsapp: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2C6.48 2 2 6.03 2 11.17c0 1.8.48 3.55 1.39 5.09L2 22l6.02-1.58A9.86 9.86 0 0 0 12 20.34C17.52 20.34 22 16.31 22 11.17S17.52 2 12 2Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M8.5 9.5c.28-.62 1.02-.8 1.48-.36.58.55 1.12 1.15 1.62 1.78.34.43.28 1.02-.12 1.38l-.72.62c.48.92 1.18 1.72 2.04 2.28l.66-.76c.36-.42.97-.48 1.4-.14.66.55 1.36 1.02 2.1 1.4.44.23.98.05 1.24-.38l.48-.82c.2-.34.12-.78-.2-1.02C15.8 12.6 14.2 11.72 12.68 11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    automation: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    prospects: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M3 19c0-2.76 2.24-5 5-5h2c2.21 0 4.08 1.42 4.74 3.4M16 8.5a2.5 2.5 0 1 1 0 5M21 19c0-1.93-1.57-3.5-3.5-3.5H16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    calendar: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    dashboard: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    tenant: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M4 9h16" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  };

  return icons[name] || null;
}

export default function AtlasLanding() {
  usePageMeta({
    title: "Atlas by Team Vision Financial",
    description:
      "Atlas is a secure AI-powered SaaS platform by Team Vision Financial for WhatsApp Business integration, prospect management, and executive business insights."
  });

  return (
    <div className="public-site atlas-landing">
      <Navbar />

      <main id="main-content">
        <section className="atlas-hero public-site__section" aria-labelledby="atlas-hero-heading">
          <div className="public-site__container atlas-hero__inner">
            <div className="atlas-hero__content">
              <p className="atlas-hero__badge">
                <span className="atlas-hero__badge-dot" aria-hidden="true" />
                By Team Vision Financial
              </p>
              <h1 id="atlas-hero-heading" className="atlas-hero__title">
                Atlas
                <span className="atlas-hero__subtitle">AI-Powered Business Platform</span>
              </h1>
              <p className="atlas-hero__lead">
                Atlas is a secure SaaS platform developed by Team Vision Financial that helps
                businesses automate customer communication, manage leads, schedule appointments, and
                integrate with the WhatsApp Business Platform.
              </p>
              <div className="atlas-hero__actions">
                <PrimaryButton as="a" href="/#contact">
                  Request a Demo
                </PrimaryButton>
                <a href="/#contact" className="public-site__button public-site__button--secondary">
                  Contact Us
                </a>
              </div>
            </div>

            <div className="atlas-hero__visual" aria-hidden="true">
              <div className="atlas-hero__panel">
                <div className="atlas-hero__panel-head">
                  <span className="atlas-hero__panel-mark">A</span>
                  <div>
                    <p className="atlas-hero__panel-title">Atlas Platform</p>
                    <p className="atlas-hero__panel-sub">Business communication hub</p>
                  </div>
                </div>
                <div className="atlas-hero__metric">
                  <span className="atlas-hero__metric-label">WhatsApp</span>
                  <span className="atlas-hero__metric-value atlas-hero__metric-value--gold">
                    Connected
                  </span>
                </div>
                <div className="atlas-hero__metric">
                  <span className="atlas-hero__metric-label">Prospects</span>
                  <span className="atlas-hero__metric-value">Organized</span>
                </div>
                <div className="atlas-hero__metric">
                  <span className="atlas-hero__metric-label">Automation</span>
                  <span className="atlas-hero__metric-value">Active</span>
                </div>
                <div className="atlas-hero__metric">
                  <span className="atlas-hero__metric-label">Security</span>
                  <span className="atlas-hero__metric-value">Role-based</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="atlas-section public-site__section public-site__section--muted"
          aria-labelledby="atlas-about-heading"
        >
          <div className="public-site__container">
            <header className="atlas-section__header">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">About Atlas</p>
              <h2 id="atlas-about-heading" className="public-site__title">
                Streamline customer engagement with AI
              </h2>
            </header>
            <div className="atlas-prose">
              <p>
                Atlas is designed for organizations that want to streamline customer engagement
                using AI and the WhatsApp Business Platform.
              </p>
              <p>
                With customer authorization, Atlas securely connects to Meta services to automate
                conversations, organize prospects, schedule appointments, and provide business
                insights through an executive dashboard.
              </p>
            </div>
          </div>
        </section>

        <section className="atlas-section public-site__section" aria-labelledby="atlas-features-heading">
          <div className="public-site__container">
            <header className="atlas-section__header atlas-section__header--center">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">Core Features</p>
              <h2 id="atlas-features-heading" className="public-site__title">
                Everything your team needs to engage customers
              </h2>
            </header>
            <div className="atlas-features">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="atlas-feature-card">
                  <span className="atlas-feature-card__icon">
                    <FeatureIcon name={feature.icon} />
                  </span>
                  <h3 className="atlas-feature-card__title">{feature.title}</h3>
                  <p className="atlas-feature-card__text">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="atlas-section public-site__section public-site__section--muted"
          aria-labelledby="atlas-security-heading"
        >
          <div className="public-site__container">
            <div className="atlas-info-card atlas-info-card--accent">
              <h2 id="atlas-security-heading">Built with Security in Mind</h2>
              <p>
                Atlas only accesses customer data after explicit authorization through Meta&apos;s
                official authentication flow.
              </p>
              <p>
                Customer data remains under the control of each connected business. Atlas does not
                sell customer information or share platform data with third parties.
              </p>
              <p>
                The platform follows secure authentication practices and role-based access controls.
              </p>
            </div>
          </div>
        </section>

        <section className="atlas-section public-site__section" aria-labelledby="atlas-whatsapp-heading">
          <div className="public-site__container">
            <div className="atlas-info-card">
              <h2 id="atlas-whatsapp-heading">Official Meta Integration</h2>
              <p>
                Atlas integrates with the WhatsApp Business Platform using Meta&apos;s official
                Embedded Signup experience.
              </p>
              <p>
                Businesses connect their own WhatsApp Business Account securely through Meta&apos;s
                authorization process.
              </p>
              <p>
                Atlas then uses the approved APIs to receive messages, automate workflows, manage
                conversations, and support customer engagement.
              </p>
            </div>
          </div>
        </section>

        <section
          className="atlas-section public-site__section public-site__section--muted"
          aria-labelledby="atlas-benefits-heading"
        >
          <div className="public-site__container">
            <header className="atlas-section__header">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">Why Businesses Use Atlas</p>
              <h2 id="atlas-benefits-heading" className="public-site__title">
                Operational impact that scales with your team
              </h2>
            </header>
            <ul className="atlas-benefits">
              {BENEFITS.map((benefit) => (
                <li key={benefit}>
                  <span className="atlas-benefits__check" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 6l2.5 2.5 4.5-5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="atlas-section public-site__section" aria-labelledby="atlas-company-heading">
          <div className="public-site__container">
            <header className="atlas-section__header">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">Company</p>
              <h2 id="atlas-company-heading" className="public-site__title">
                Developed by Team Vision Financial
              </h2>
            </header>
            <div className="atlas-prose">
              <p>
                Team Vision Financial develops technology solutions that help businesses improve
                customer communication, operational efficiency, and digital engagement.
              </p>
              <p>
                Atlas is one of our flagship software platforms designed to modernize business
                communication through AI and automation.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="atlas-footer">
        <div className="public-site__container atlas-footer__inner">
          <div>
            <p className="atlas-footer__brand">Team Vision Financial</p>
            <p className="atlas-footer__domain">
              <a href="https://teamvisionfinancial.com" target="_blank" rel="noopener noreferrer">
                teamvisionfinancial.com
              </a>
            </p>
            <p className="atlas-footer__tagline">
              Secure business communication software powered by AI and the WhatsApp Business
              Platform.
            </p>
          </div>
          <nav className="atlas-footer__nav" aria-label="Atlas footer">
            <a href="/#contact">Contact Us</a>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </nav>
          <p className="atlas-footer__copy">
            &copy; {new Date().getFullYear()} Team Vision Financial. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
