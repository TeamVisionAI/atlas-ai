import "./PublicSection.css";

export default function About() {
  return (
    <section id="about" className="public-site__section public-site__section--muted public-section" aria-labelledby="about-heading">
      <div className="public-site__container public-section__grid">
        <div>
          <p className="public-site__eyebrow">About us</p>
          <h2 id="about-heading" className="public-site__title">
            About Team Vision Financial
          </h2>
          <p className="public-section__text">
            Team Vision Financial serves clients who want straightforward guidance on life
            insurance, retirement preparation, and financial education—not jargon, pressure, or
            one-size-fits-all products. Our mission is to help families protect what matters and
            plan with confidence.
          </p>
        </div>

        <div className="public-section__cards">
          <article className="public-section__card">
            <h3 className="public-section__card-title">Our mission</h3>
            <p className="public-section__card-text">
              To empower individuals and families with clear, ethical financial guidance rooted in
              protection, retirement readiness, and lifelong learning.
            </p>
          </article>
          <article className="public-section__card">
            <h3 className="public-section__card-title">Our approach</h3>
            <p className="public-section__card-text">
              We listen first, explain options in plain language, and recommend strategies aligned
              with each client&apos;s goals, budget, and stage of life.
            </p>
          </article>
          <article className="public-section__card">
            <h3 className="public-section__card-title">Our commitment</h3>
            <p className="public-section__card-text">
              Accessible service, ongoing education, and a long-term partnership—whether you are
              exploring coverage, planning for retirement, or building your financial knowledge.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
