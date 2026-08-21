import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import {
  PUBLIC_SITE_BRAND,
  getAtlasAppLoginUrl
} from "../../config/publicSiteHost";
import { ATLAS_BRAND_ASSETS } from "../../config/publicBrandAssets";
import { usePublicSiteBrand } from "../../hooks/usePublicSiteBrand";
import { useContactNavigation } from "../../hooks/useContactNavigation";
import "./PublicNavbar.css";

const teamVisionSectionLinks = [
  { href: "/#about", label: "About" },
  { href: "/#services", label: "Services" },
  { href: "/#careers", label: "Careers" },
  { href: "/#contact", label: "Contact", isContact: true },
  { to: "/atlas", label: "Atlas", isRoute: true }
];

const atlasSectionLinks = [
  { to: "/", label: "Home", isRoute: true },
  { to: "/privacy", label: "Privacy", isRoute: true },
  { to: "/terms", label: "Terms", isRoute: true },
  { href: "mailto:support@teamvisionfinancial.com", label: "Contact / Support", isMailto: true }
];

const teamVisionLegalLinks = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/legal", label: "Legal" },
  { to: "/terms", label: "Terms of Service" }
];

const atlasLegalLinks = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Service" },
  { to: "/data-deletion", label: "Data Deletion" }
];

export default function Navbar() {
  const location = useLocation();
  const brand = usePublicSiteBrand();
  const isAtlas = brand === PUBLIC_SITE_BRAND.ATLAS;
  const goToContact = useContactNavigation();
  const menuId = useId();
  const menuToggleRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const sectionLinks = isAtlas ? atlasSectionLinks : teamVisionSectionLinks;
  const legalLinks = isAtlas ? atlasLegalLinks : teamVisionLegalLinks;
  const signInHref = isAtlas ? getAtlasAppLoginUrl() : appPath();
  const signInIsExternal = isAtlas;

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

  function renderNavLink(link, className, extraProps = {}) {
    if (link.isMailto) {
      return (
        <a key={link.href} href={link.href} className={className} {...extraProps}>
          {link.label}
        </a>
      );
    }
    if (link.isRoute) {
      return (
        <Link
          key={link.to}
          to={link.to}
          className={`${className}${location.pathname === link.to ? " is-active" : ""}`}
          {...extraProps}
        >
          {link.label}
        </Link>
      );
    }
    if (link.isContact) {
      return (
        <a
          key={link.href}
          href={link.href}
          className={className}
          onClick={goToContact}
          {...extraProps}
        >
          {link.label}
        </a>
      );
    }
    return (
      <a key={link.href} href={link.href} className={className} {...extraProps}>
        {link.label}
      </a>
    );
  }

  return (
    <header className="public-navbar">
      <div className="public-navbar__inner public-site__container">
        <Link
          to="/"
          className="public-navbar__brand"
          aria-label={isAtlas ? "Atlas AI home" : "Team Vision Financial home"}
          onClick={handleBrandClick}
        >
          {isAtlas ? (
            <img
              className="public-navbar__brand-logo"
              src={ATLAS_BRAND_ASSETS.logoMark64}
              alt=""
              width={32}
              height={32}
              decoding="async"
            />
          ) : (
            <span className="public-navbar__brand-mark" aria-hidden="true">
              TV
            </span>
          )}
          <span className="public-navbar__brand-text">
            {isAtlas ? "Atlas AI" : "Team Vision Financial"}
          </span>
        </Link>

        <nav className="public-navbar__nav" aria-label="Primary">
          {sectionLinks.map((link) => renderNavLink(link, "public-navbar__link"))}
        </nav>

        <div className="public-navbar__actions">
          {signInIsExternal ? (
            <a
              href={signInHref}
              className="public-site__button public-site__button--secondary public-navbar__sign-in"
            >
              Sign in
            </a>
          ) : (
            <Link
              to={signInHref}
              className="public-site__button public-site__button--secondary public-navbar__sign-in"
            >
              Atlas Sign In
            </Link>
          )}
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
              <li key={link.href || link.to}>
                {link.isMailto ? (
                  <a
                    href={link.href}
                    className="public-navbar__mobile-link"
                    tabIndex={menuOpen ? 0 : -1}
                    onClick={closeMenu}
                  >
                    {link.label}
                  </a>
                ) : link.isRoute ? (
                  <Link
                    to={link.to}
                    className={`public-navbar__mobile-link${location.pathname === link.to ? " is-active" : ""}`}
                    tabIndex={menuOpen ? 0 : -1}
                    onClick={closeMenu}
                  >
                    {link.label}
                  </Link>
                ) : link.isContact ? (
                  <a
                    href={link.href}
                    className="public-navbar__mobile-link"
                    tabIndex={menuOpen ? 0 : -1}
                    onClick={(event) => {
                      closeMenu();
                      goToContact(event);
                    }}
                  >
                    {link.label}
                  </a>
                ) : (
                  <a
                    href={link.href}
                    className="public-navbar__mobile-link"
                    tabIndex={menuOpen ? 0 : -1}
                    onClick={closeMenu}
                  >
                    {link.label}
                  </a>
                )}
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

          {signInIsExternal ? (
            <a
              href={signInHref}
              className="public-site__button public-site__button--secondary public-navbar__mobile-sign-in"
              tabIndex={menuOpen ? 0 : -1}
              onClick={closeMenu}
            >
              Sign in
            </a>
          ) : (
            <Link
              to={signInHref}
              className="public-site__button public-site__button--secondary public-navbar__mobile-sign-in"
              tabIndex={menuOpen ? 0 : -1}
              onClick={closeMenu}
            >
              Atlas Sign In
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
