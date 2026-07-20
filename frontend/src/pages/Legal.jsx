import { Link } from "react-router-dom";
import Navbar from "../components/public/Navbar";
import Footer from "../components/public/Footer";
import "./PublicSite.css";

export default function Legal() {
  return (
    <div className="public-site">
      <Navbar />
      <main id="main-content" className="public-site__legal">
        <div className="public-site__container">
          <h1>Legal</h1>
          <p className="public-site__legal-updated">Last updated: {/* TODO: Set official publish date. */} July 2026</p>

          <p>
            This page provides general legal information about Team Vision Financial and the use of
            this website. It does not create an advisory, fiduciary, or client relationship.
          </p>

          <h2>Regulatory information</h2>
          <p>
            {/* TODO: Confirm licensed entity name, NPN, and state licenses with compliance before production. */}
            Team Vision Financial provides financial services including life insurance and retirement
            planning guidance. Products and services may be offered through licensed professionals
            and affiliated entities as required by applicable state and federal law.
          </p>

          <h2>No professional advice</h2>
          <p>
            Information on this website is for general educational purposes only. It does not
            constitute investment, legal, tax, or accounting advice. You should consult qualified
            professionals before making financial decisions.
          </p>

          <h2>Third-party products</h2>
          <p>
            Insurance and financial products discussed on this site may be underwritten or offered by
            third-party carriers and institutions. Product availability, features, and approvals vary
            by state and individual eligibility.
          </p>

          <h2>Website use</h2>
          <p>
            By using this website, you agree to our{" "}
            <Link to="/privacy">Privacy Policy</Link> and{" "}
            <Link to="/terms">Terms of Service</Link>. Unauthorized use, copying, or redistribution of
            site content is prohibited.
          </p>

          <h2>Contact</h2>
          <p>
            Legal inquiries may be sent to{" "}
            <a href="mailto:legal@teamvisionfinancial.com">legal@teamvisionfinancial.com</a>.
            {/* TODO: Replace with official legal contact email. */}
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
