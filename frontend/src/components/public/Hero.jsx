import "./PublicHero.css";
import PrimaryButton from "./PrimaryButton";

const heroServices = [
  {
    title: "Life Insurance",
    description: "Protection strategies to help safeguard your family and income."
  },
  {
    title: "Retirement Strategies",
    description: "Planning guidance to help you prepare for a confident retirement."
  },
  {
    title: "Financial Education",
    description: "Clear, practical education so you can make informed financial decisions."
  }
];

export default function Hero() {
  return (
    <section className="public-hero public-site__section" aria-labelledby="hero-heading">
      <div className="public-site__container public-hero__grid">
        <div className="public-hero__content">
          <p className="public-site__eyebrow">Life insurance · Retirement · Financial education</p>
          <h1 id="hero-heading" className="public-hero__title">
            Protecting families. Building financial futures.
          </h1>
          <p className="public-site__lead">
            Team Vision Financial helps individuals and families understand their options for life
            insurance, retirement planning, and long-term financial security.
          </p>
          <p className="public-hero__mission">
            We are a financial services firm dedicated to guiding clients through protection,
            retirement, and education—with personalized support every step of the way.
          </p>
          <div className="public-hero__actions">
            <PrimaryButton as="a" href="#contact">
              Schedule Your Consultation
            </PrimaryButton>
          </div>
        </div>

        <div className="public-hero__panel">
          {heroServices.map((service) => (
            <div key={service.title} className="public-hero__stat">
              <span className="public-hero__stat-value">{service.title}</span>
              <span className="public-hero__stat-label">{service.description}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
