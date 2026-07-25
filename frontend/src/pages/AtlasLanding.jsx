import { Link } from "react-router-dom";
import Navbar from "../components/public/Navbar";
import ContactLink from "../components/public/ContactLink";
import { usePageMeta } from "../hooks/usePageMeta";
import "./PublicSite.css";
import "./AtlasLanding.css";

const META_FEATURES = [
  { label: "Meta Embedded Signup", icon: "meta-signup" },
  { label: "WhatsApp Business Platform", icon: "whatsapp" },
  { label: "Official Graph API Integration", icon: "graph-api" },
  { label: "Secure OAuth Authentication", icon: "oauth" },
  { label: "Customer-Owned Business Accounts", icon: "ownership" }
];

const PRODUCT_PREVIEWS = [
  {
    title: "Executive Dashboard",
    description: "Real-time visibility into interviews, pipeline health, and team performance.",
    variant: "executive"
  },
  {
    title: "Mission Control",
    description: "Operational command center for workflows, activity, and daily priorities.",
    variant: "mission"
  },
  {
    title: "Prospect Workspace",
    description: "Unified view of conversations, history, and next steps for every lead.",
    variant: "prospect"
  }
];

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

const BUSINESS_TYPES = [
  { title: "Financial Services", icon: "finance" },
  { title: "Insurance Agencies", icon: "insurance" },
  { title: "Sales Organizations", icon: "sales" },
  { title: "Professional Services", icon: "professional" },
  { title: "Growing Businesses", icon: "growth" }
];

const TRUST_CARDS = [
  { title: "AI Automation", icon: "automation" },
  { title: "Secure Cloud Platform", icon: "cloud" },
  { title: "Role-Based Access", icon: "roles" },
  { title: "Real-Time Dashboards", icon: "dashboard" },
  { title: "Official Meta Integration", icon: "whatsapp" },
  { title: "Enterprise Architecture", icon: "tenant" }
];

const BENEFITS = [
  "Reduce response times",
  "Improve customer engagement",
  "Automate repetitive conversations",
  "Organize prospects in one platform",
  "Increase operational efficiency"
];

function AtlasIcon({ name, size = 22 }) {
  const icons = {
    whatsapp: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    dashboard: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    tenant: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M4 9h16" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    "meta-signup": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="17" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    "graph-api": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 18V6M10 18V10M16 18V14M22 18V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="4" cy="6" r="1.5" fill="currentColor" />
        <circle cx="10" cy="10" r="1.5" fill="currentColor" />
        <circle cx="16" cy="14" r="1.5" fill="currentColor" />
        <circle cx="22" cy="4" r="1.5" fill="currentColor" />
      </svg>
    ),
    oauth: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1.5" fill="currentColor" />
      </svg>
    ),
    ownership: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    finance: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v18M7 7h6.5a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    insurance: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l8 4v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9.5 12.5 11 14l3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    sales: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 19V5M4 19h16M8 15V9M12 15V7M16 15v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    professional: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    growth: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 18h16M6 18V12M10 18V9M14 18V11M18 18V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    cloud: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.6A3.5 3.5 0 0 0 7 18Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
    roles: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l7 4v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V7l7-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9.5 12.5 11 14l3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  };

  return icons[name] || null;
}

function BrowserMockup({ title, variant }) {
  return (
    <div className="atlas-browser-mockup" data-variant={variant}>
      <div className="atlas-browser-mockup__chrome">
        <span className="atlas-browser-mockup__dot" />
        <span className="atlas-browser-mockup__dot" />
        <span className="atlas-browser-mockup__dot" />
        <span className="atlas-browser-mockup__url">app.teamvisionfinancial.com</span>
      </div>
      <div className="atlas-browser-mockup__screen">
        {/* Replace this placeholder block with <img src="..." alt="..." /> when screenshots are ready. */}
        <div className="atlas-browser-mockup__placeholder" aria-hidden="true">
          <div className="atlas-browser-mockup__sidebar" />
          <div className="atlas-browser-mockup__content">
            <div className="atlas-browser-mockup__bar atlas-browser-mockup__bar--wide" />
            <div className="atlas-browser-mockup__grid">
              <div className="atlas-browser-mockup__card" />
              <div className="atlas-browser-mockup__card" />
              <div className="atlas-browser-mockup__card atlas-browser-mockup__card--tall" />
            </div>
          </div>
        </div>
        <p className="atlas-browser-mockup__label">{title} preview</p>
      </div>
    </div>
  );
}

export default function AtlasLanding() {
  usePageMeta({
    title: "Atlas | AI-Powered Business Platform | Team Vision Financial",
    description:
      "Atlas is a secure AI-powered SaaS platform that integrates with the WhatsApp Business Platform through Meta's official Embedded Signup process, helping businesses automate conversations, manage leads, and improve customer engagement."
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
              <div className="atlas-hero__lead">
                <p>
                  Atlas is an AI-powered SaaS platform developed by Team Vision Financial that
                  enables businesses to securely connect with the WhatsApp Business Platform through
                  Meta&apos;s official Embedded Signup process.
                </p>
                <p>
                  Businesses can automate customer conversations, manage leads, schedule
                  appointments, and gain real-time operational insights from a single platform.
                </p>
              </div>
              <div className="atlas-hero__actions">
                <ContactLink primary>Request a Demo</ContactLink>
                <ContactLink className="public-site__button public-site__button--secondary">
                  Contact Us
                </ContactLink>
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
                  <span className="atlas-hero__metric-label">Meta Auth</span>
                  <span className="atlas-hero__metric-value">Embedded Signup</span>
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
          aria-labelledby="atlas-meta-heading"
        >
          <div className="public-site__container">
            <div className="atlas-meta-panel">
              <header className="atlas-section__header">
                <div className="atlas-section__gold-rule" aria-hidden="true" />
                <p className="public-site__eyebrow">Meta Integration</p>
                <h2 id="atlas-meta-heading" className="public-site__title">
                  Built with Meta Technologies
                </h2>
              </header>
              <div className="atlas-prose atlas-meta-panel__body">
                <p>
                  Atlas integrates with Meta&apos;s official technologies to provide secure customer
                  communication through the WhatsApp Business Platform.
                </p>
                <p>
                  Using Meta&apos;s Embedded Signup experience, businesses authorize their own
                  WhatsApp Business Account directly with Meta. Atlas never bypasses Meta
                  authentication and only accesses customer data after explicit customer
                  authorization.
                </p>
              </div>
              <ul className="atlas-meta-features">
                {META_FEATURES.map((feature) => (
                  <li key={feature.label} className="atlas-meta-feature">
                    <span className="atlas-meta-feature__icon">
                      <AtlasIcon name={feature.icon} />
                    </span>
                    <span className="atlas-meta-feature__check" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2.5 6l2.5 2.5 4.5-5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span>{feature.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="atlas-section public-site__section" aria-labelledby="atlas-inside-heading">
          <div className="public-site__container">
            <header className="atlas-section__header atlas-section__header--center">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">Product Preview</p>
              <h2 id="atlas-inside-heading" className="public-site__title">
                Inside Atlas
              </h2>
              <p className="public-site__lead">
                A production-ready workspace for customer communication, lead management, and
                executive visibility.
              </p>
            </header>
            <div className="atlas-previews">
              {PRODUCT_PREVIEWS.map((preview) => (
                <article key={preview.title} className="atlas-preview-card">
                  <BrowserMockup title={preview.title} variant={preview.variant} />
                  <h3 className="atlas-preview-card__title">{preview.title}</h3>
                  <p className="atlas-preview-card__text">{preview.description}</p>
                </article>
              ))}
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

        <section className="atlas-section public-site__section" aria-labelledby="atlas-audience-heading">
          <div className="public-site__container">
            <header className="atlas-section__header atlas-section__header--center">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">Industries</p>
              <h2 id="atlas-audience-heading" className="public-site__title">
                Who Uses Atlas
              </h2>
            </header>
            <div className="atlas-audience-grid">
              {BUSINESS_TYPES.map((type) => (
                <article key={type.title} className="atlas-audience-card">
                  <span className="atlas-audience-card__icon">
                    <AtlasIcon name={type.icon} />
                  </span>
                  <h3 className="atlas-audience-card__title">{type.title}</h3>
                </article>
              ))}
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
                    <AtlasIcon name={feature.icon} />
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
                Atlas follows secure authentication and authorization practices using Meta&apos;s
                official APIs.
              </p>
              <p>
                Businesses maintain ownership of their own WhatsApp Business Accounts and customer
                data.
              </p>
              <p>
                Atlas never sells customer information and never accesses customer data without
                explicit authorization.
              </p>
              <p>
                Role-based permissions, encrypted communication, and secure API integrations help
                protect every connected organization.
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
          aria-labelledby="atlas-data-permissions-heading"
        >
          <div className="public-site__container">
            <div className="atlas-info-card">
              <h2 id="atlas-data-permissions-heading">Customer Data &amp; Permissions</h2>
              <p>
                Atlas only accesses business data after explicit customer authorization through
                Meta&apos;s official authentication process.
              </p>
              <p>
                Each business connects and controls its own WhatsApp Business Account.
              </p>
              <p>
                Customers can disconnect Atlas at any time by removing the integration from their
                Meta Business settings.
              </p>
              <p>
                Atlas never accesses data from businesses that have not explicitly authorized the
                platform.
              </p>
            </div>
          </div>
        </section>

        <section
          className="atlas-section public-site__section public-site__section--muted"
          aria-labelledby="atlas-trust-heading"
        >
          <div className="public-site__container">
            <header className="atlas-section__header atlas-section__header--center">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">Trust</p>
              <h2 id="atlas-trust-heading" className="public-site__title">
                Why Businesses Trust Atlas
              </h2>
            </header>
            <div className="atlas-trust-grid">
              {TRUST_CARDS.map((card) => (
                <article key={card.title} className="atlas-trust-card">
                  <span className="atlas-trust-card__icon">
                    <AtlasIcon name={card.icon} size={20} />
                  </span>
                  <h3 className="atlas-trust-card__title">{card.title}</h3>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="atlas-section public-site__section"
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

        <section
          className="atlas-section public-site__section public-site__section--muted"
          aria-labelledby="atlas-company-heading"
        >
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
            <Link to="/">Team Vision Financial</Link>
            <Link to="/atlas">Atlas Platform</Link>
            <ContactLink className="atlas-footer__nav-link">Contact Us</ContactLink>
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
