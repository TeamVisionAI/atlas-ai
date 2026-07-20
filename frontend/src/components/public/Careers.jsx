import "./PublicSection.css";

export default function Careers() {
  return (
    <section
      id="careers"
      className="public-site__section public-site__section--muted public-section"
      aria-labelledby="careers-heading"
    >
      <div className="public-site__container public-section__grid">
        <div>
          <p className="public-site__eyebrow">Join our team</p>
          <h2 id="careers-heading" className="public-site__title">
            Career opportunities
          </h2>
          <p className="public-section__text">
            Team Vision Financial is growing a team of advisors and professionals who believe in
            education, integrity, and helping families make confident financial decisions. If you
            are interested in a career in financial services, we would like to hear from you.
          </p>
        </div>

        <div className="public-section__card public-section__card--highlight">
          <h3 className="public-section__card-title">Join Team Vision</h3>
          <p className="public-section__card-text">
            We&apos;re looking for motivated, coachable individuals who want to make a difference by
            helping families while building a rewarding career in financial services. No prior
            financial services experience is required. We provide licensing guidance, professional
            training, mentorship, and a proven system to help qualified individuals succeed.
          </p>
          <ul className="public-section__list">
            <li>Flexible full-time or part-time opportunity</li>
            <li>Licensing guidance and professional training</li>
            <li>Mentorship from experienced leaders</li>
            <li>Performance-based income and advancement</li>
            <li>Opportunity to build your own business while helping families</li>
          </ul>
          <p className="public-section__card-text">
            Interested in learning more? Schedule a confidential career consultation and discover
            whether Team Vision is the right fit for you.
          </p>
        </div>
      </div>
    </section>
  );
}
