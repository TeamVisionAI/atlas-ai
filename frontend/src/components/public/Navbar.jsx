import { Link, useLocation } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import "./PublicNavbar.css";

const navLinks = [
  { href: "/#about", label: "About" },
  { href: "/#services", label: "Services" },
  { href: "/#careers", label: "Careers" },
  { href: "/#contact", label: "Contact" }
];

export default function Navbar() {
  const location = useLocation();

  function handleBrandClick(event) {
    if (location.pathname === "/") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <header className="public-navbar">
      <div className="public-navbar__inner public-site__container">
        <Link
          to="/"
          className="public-navbar__brand"
          aria-label="Team Vision Financial home"
          onClick={handleBrandClick}
        >
          <span className="public-navbar__brand-mark" aria-hidden="true">
            TV
          </span>
          <span className="public-navbar__brand-text">
            Team Vision Financial
          </span>
        </Link>

        <nav className="public-navbar__nav" aria-label="Primary">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="public-navbar__link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="public-navbar__actions">
          <Link to={appPath()} className="public-site__button public-site__button--secondary public-navbar__sign-in">
            Atlas Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
