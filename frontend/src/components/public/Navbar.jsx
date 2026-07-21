import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import "./PublicNavbar.css";

const sectionLinks = [
  { href: "/#about", label: "About" },
  { href: "/#services", label: "Services" },
  { href: "/#careers", label: "Careers" },
  { href: "/#contact", label: "Contact" },
];

const legalLinks = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/legal", label: "Legal" },
  { to: "/terms", label: "Terms of Service" },
];

export default function Navbar() {
  const location = useLocation();
  const menuId = useId();
  const menuToggleRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  function toggleMenu() {
    setMenuOpen((open) => !open);
  }

  function handleBrandClick(event) {
    closeMenu();
    if (location.pathname === "/") {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  useEffect(() => {
    closeMenu();
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        menuToggleRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

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
          {sectionLinks.map((link) => (
            <a key={link.href} href={link.href} className="public-navbar__link">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="public-navbar__actions">
          <Link
            to={appPath()}
            className="public-site__button public-site__button--secondary public-navbar__sign-in"
          >
            Atlas Sign In
          </Link>
        </div>

        <button
          ref={menuToggleRef}
          type="button"
          className="public-navbar__menu-toggle"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={toggleMenu}
        >
          <span
            className={`public-navbar__menu-icon${menuOpen ? " is-open" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <button
        type="button"
        className={`public-navbar__mobile-overlay${menuOpen ? " is-open" : ""}`}
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={closeMenu}
      />

      <nav
        id={menuId}
        className={`public-navbar__mobile-nav${menuOpen ? " is-open" : ""}`}
        aria-label="Mobile primary"
        aria-hidden={!menuOpen}
      >
        <div className="public-navbar__mobile-nav-inner public-site__container">
          <ul className="public-navbar__mobile-list">
            {sectionLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="public-navbar__mobile-link"
                  tabIndex={menuOpen ? 0 : -1}
                  onClick={closeMenu}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <ul className="public-navbar__mobile-list public-navbar__mobile-list--legal">
            {legalLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="public-navbar__mobile-link"
                  tabIndex={menuOpen ? 0 : -1}
                  onClick={closeMenu}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <Link
            to={appPath()}
            className="public-site__button public-site__button--secondary public-navbar__mobile-sign-in"
            tabIndex={menuOpen ? 0 : -1}
            onClick={closeMenu}
          >
            Atlas Sign In
          </Link>
        </div>
      </nav>
    </header>
  );
}
