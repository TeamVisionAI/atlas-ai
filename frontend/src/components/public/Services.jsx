import "./PublicSection.css";

const services = [
  {
    title: "Life Insurance",
    description:
      "Term and permanent solutions to help protect your family, income, and financial obligations when it matters most."
  },
  {
    title: "Retirement Strategies",
    description:
      "Retirement income planning, savings strategies, and guidance to help you work toward the future you envision."
  },
  {
    title: "Financial Education",
    description:
      "Workshops, one-on-one guidance, and resources that help clients and advisors understand products, planning, and next steps."
  }
];

export default function Services() {
  return (
    <section
      id="services"
      className="public-site__section public-section"
      aria-labelledby="services-heading"
    >
      <div className="public-site__container">
        <p className="public-site__eyebrow">What we do</p>
        <h2 id="services-heading" className="public-site__title">
          Services
        </h2>
        <p className="public-site__lead public-section__intro">
          Three core areas where Team Vision Financial supports clients and the advisors who serve
          them.
        </p>

        <div className="public-section__cards public-section__cards--four">
          {services.map((service) => (
            <article key={service.title} className="public-section__card">
              <h3 className="public-section__card-title">{service.title}</h3>
              <p className="public-section__card-text">{service.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
