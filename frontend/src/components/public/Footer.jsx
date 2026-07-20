import { Link } from "react-router-dom";
import "./PublicFooter.css";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="public-footer">
      <div className="public-site__container public-footer__inner">
        <div className="public-footer__brand">
          <p className="public-footer__name">Team Vision Financial</p>
          <p className="public-footer__tagline">
            Life insurance, retirement strategies, and financial education for individuals and
            families.
          </p>
        </div>

        <nav className="public-footer__nav" aria-label="Footer">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/legal">Legal</Link>
          <Link to="/terms">Terms of Service</Link>
        </nav>
      </div>

      <div className="public-site__container public-footer__legal">
        <p>
          &copy; {year} Team Vision Financial. All rights reserved.
        </p>
        <p className="public-footer__disclaimer">
          {/* TODO: Replace with approved legal disclaimer copy from compliance. */}
          Information on this website is for general purposes only and does not constitute
          investment, legal, or tax advice.
        </p>
      </div>
    </footer>
  );
}
