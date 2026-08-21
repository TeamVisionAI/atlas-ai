import { Link } from "react-router-dom";
import { PUBLIC_SITE_BRAND } from "../../config/publicSiteHost";
import { usePublicSiteBrand } from "../../hooks/usePublicSiteBrand";
import "./PublicFooter.css";

export default function Footer() {
  const year = new Date().getFullYear();
  const brand = usePublicSiteBrand();
  const isAtlas = brand === PUBLIC_SITE_BRAND.ATLAS;

  if (isAtlas) {
    return (
      <footer className="public-footer">
        <div className="public-site__container public-footer__inner">
          <div className="public-footer__brand">
            <p className="public-footer__name">Atlas AI</p>
            <p className="public-footer__tagline">
              Connect • Automate • Grow — recruiting, follow-up, scheduling, and team execution.
            </p>
          </div>

          <nav className="public-footer__nav" aria-label="Footer">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/data-deletion">Data Deletion</Link>
            <Link to="/contact">Contact / Support</Link>
          </nav>
        </div>

        <div className="public-site__container public-footer__legal">
          <p>&copy; {year} Atlas AI. All rights reserved.</p>
          <p className="public-footer__disclaimer">
            Atlas AI is a software platform. Information on this website is for general purposes
            only and does not constitute legal, tax, or investment advice.
          </p>
        </div>
      </footer>
    );
  }

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
          <Link to="/atlas">Atlas</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/legal">Legal</Link>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/data-deletion">Privacy & Data Deletion</Link>
        </nav>
      </div>

      <div className="public-site__container public-footer__legal">
        <p>&copy; {year} Team Vision Financial. All rights reserved.</p>
        <p className="public-footer__disclaimer">
          Information on this website is for general purposes only and does not constitute
          investment, legal, or tax advice.
        </p>
      </div>
    </footer>
  );
}
