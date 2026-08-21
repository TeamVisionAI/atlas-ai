import Navbar from "../components/public/Navbar";
import Footer from "../components/public/Footer";
import { Link } from "react-router-dom";
import { getAtlasAppLoginUrl } from "../config/publicSiteHost";
import { ATLAS_BRAND_ASSETS } from "../config/publicBrandAssets";
import { usePageMeta } from "../hooks/usePageMeta";
import "./PublicSite.css";
import "./AtlasLanding.css";

const PILLARS = [
  {
    title: "Recruiting",
    description: "Capture and qualify prospects with guided conversations and clear next steps."
  },
  {
    title: "Follow-up",
    description: "Keep outreach consistent so leads do not stall between first contact and meeting."
  },
  {
    title: "Scheduling",
    description: "Book appointments and sync calendars so teams show up prepared."
  },
  {
    title: "Team execution",
    description: "Give leaders and agents one workspace for pipeline, conversations, and action."
  }
];

const CAPABILITIES = [
  {
    title: "WhatsApp Business",
    description: "Connect tenant-owned WhatsApp Business accounts through Meta Embedded Signup."
  },
  {
    title: "AI-assisted conversations",
    description: "Automate qualification and follow-up while keeping humans in control."
  },
  {
    title: "Prospect workspace",
    description: "Organize contacts, history, and workflow status for every lead."
  },
  {
    title: "Appointments & reminders",
    description: "Schedule meetings and send timely reminders across connected channels."
  },
  {
    title: "Mission Control",
    description: "Operational views for daily priorities, interviews, and team activity."
  },
  {
    title: "Multi-tenant workspaces",
    description: "Each organization keeps its own branding, users, and data isolation."
  }
];

export default function AtlasPublicHome() {
  const loginUrl = getAtlasAppLoginUrl();

  usePageMeta({
    title: "Atlas AI | Connect • Automate • Grow",
    description:
      "Atlas AI helps insurance and recruiting organizations connect with prospects, automate follow-up, schedule meetings, and execute as a team.",
    ogTitle: "Atlas AI",
    ogImage: `${typeof window !== "undefined" ? window.location.origin : "https://useatlas-ai.com"}${ATLAS_BRAND_ASSETS.ogImage}`
  });

  return (
    <div className="public-site atlas-landing atlas-public-home">
      <Navbar />

      <main id="main-content">
        <section className="atlas-hero public-site__section" aria-labelledby="atlas-home-heading">
          <div className="public-site__container atlas-hero__inner">
            <div className="atlas-hero__content">
              <p className="atlas-hero__badge">
                <span className="atlas-hero__badge-dot" aria-hidden="true" />
                Atlas AI
              </p>
              <h1 id="atlas-home-heading" className="atlas-hero__title">
                Atlas AI
                <span className="atlas-hero__subtitle">Connect • Automate • Grow</span>
              </h1>
              <div className="atlas-hero__lead">
                <p>
                  Atlas is an AI-powered operations platform for organizations that recruit, follow
                  up, and schedule at scale—starting with insurance teams that need reliable
                  prospect engagement without losing the human touch.
                </p>
                <p>
                  Connect your channels, automate the repetitive work, and grow pipeline with a
                  shared workspace for conversations, appointments, and team execution.
                </p>
              </div>
              <div className="atlas-hero__actions">
                <a
                  href={loginUrl}
                  className="public-site__button public-site__button--primary"
                >
                  Sign in to Atlas
                </a>
                <Link
                  to="/contact"
                  className="public-site__button public-site__button--secondary"
                >
                  Contact / Support
                </Link>
              </div>
            </div>

            <div className="atlas-hero__visual" aria-hidden="true">
              <div className="atlas-hero__panel">
                <div className="atlas-hero__panel-head">
                  <img
                    className="atlas-hero__panel-logo"
                    src={ATLAS_BRAND_ASSETS.logoMark96}
                    alt=""
                    width={48}
                    height={48}
                    decoding="async"
                  />
                  <div>
                    <p className="atlas-hero__panel-title">Atlas AI</p>
                    <p className="atlas-hero__panel-sub">Connect • Automate • Grow</p>
                  </div>
                </div>
                <div className="atlas-hero__metric">
                  <span className="atlas-hero__metric-label">Recruiting</span>
                  <span className="atlas-hero__metric-value atlas-hero__metric-value--gold">
                    Active
                  </span>
                </div>
                <div className="atlas-hero__metric">
                  <span className="atlas-hero__metric-label">Follow-up</span>
                  <span className="atlas-hero__metric-value">Automated</span>
                </div>
                <div className="atlas-hero__metric">
                  <span className="atlas-hero__metric-label">Scheduling</span>
                  <span className="atlas-hero__metric-value">Synced</span>
                </div>
                <div className="atlas-hero__metric">
                  <span className="atlas-hero__metric-label">Team execution</span>
                  <span className="atlas-hero__metric-value">Shared</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="atlas-section public-site__section public-site__section--muted"
          aria-labelledby="atlas-pillars-heading"
        >
          <div className="public-site__container">
            <header className="atlas-section__header atlas-section__header--center">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">What Atlas does</p>
              <h2 id="atlas-pillars-heading" className="public-site__title">
                Recruiting, follow-up, scheduling, and team execution
              </h2>
              <p className="public-site__lead">
                Built for insurance and similar field organizations that need consistent prospect
                engagement across agents and offices.
              </p>
            </header>
            <div className="atlas-features">
              {PILLARS.map((pillar) => (
                <article key={pillar.title} className="atlas-feature-card">
                  <h3 className="atlas-feature-card__title">{pillar.title}</h3>
                  <p className="atlas-feature-card__text">{pillar.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="atlas-section public-site__section" aria-labelledby="atlas-cap-heading">
          <div className="public-site__container">
            <header className="atlas-section__header atlas-section__header--center">
              <div className="atlas-section__gold-rule" aria-hidden="true" />
              <p className="public-site__eyebrow">Platform</p>
              <h2 id="atlas-cap-heading" className="public-site__title">
                Capabilities for connected teams
              </h2>
            </header>
            <div className="atlas-features">
              {CAPABILITIES.map((item) => (
                <article key={item.title} className="atlas-feature-card">
                  <h3 className="atlas-feature-card__title">{item.title}</h3>
                  <p className="atlas-feature-card__text">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="atlas-section public-site__section public-site__section--muted"
          aria-labelledby="atlas-cta-heading"
        >
          <div className="public-site__container">
            <div className="atlas-info-card atlas-info-card--accent">
              <h2 id="atlas-cta-heading">Ready to get started?</h2>
              <p>
                Sign in to your organization workspace on Atlas to manage prospects, conversations,
                and appointments.
              </p>
              <p>
                <a href={loginUrl} className="public-site__button public-site__button--primary">
                  Go to Atlas login
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
