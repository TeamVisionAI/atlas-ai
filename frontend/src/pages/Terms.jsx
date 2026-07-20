import Navbar from "../components/public/Navbar";
import Footer from "../components/public/Footer";
import "./PublicSite.css";

export default function Terms() {
  return (
    <div className="public-site">
      <Navbar />
      <main id="main-content" className="public-site__legal">
        <div className="public-site__container">
          <h1>Terms of Service</h1>
          <p className="public-site__legal-updated">Last updated: {/* TODO: Set official publish date. */} July 2026</p>

          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Team
            Vision Financial website and related online services. By using this site, you agree to
            these Terms.
          </p>

          <h2>Use of the website</h2>
          <p>
            You may use this website for lawful purposes only. You agree not to misuse the site,
            attempt unauthorized access, or interfere with its operation.
          </p>

          <h2>No professional advice</h2>
          <p>
            Content on this website is provided for general informational purposes. It does not
            constitute investment, legal, tax, or accounting advice. You should consult qualified
            professionals before making financial decisions.
          </p>

          <h2>Accounts and internal tools</h2>
          <p>
            Access to private team applications is restricted to authorized users. You are
            responsible for safeguarding credentials and for activity under your account.
          </p>

          <h2>Intellectual property</h2>
          <p>
            All content, branding, and materials on this site are owned by Team Vision Financial or
            its licensors and may not be copied or reused without permission.
          </p>

          <h2>Disclaimer of warranties</h2>
          <p>
            This website is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis
            without warranties of any kind, to the fullest extent permitted by law.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            {/* TODO: Review limitation of liability language with legal counsel before production. */}
            To the extent permitted by law, Team Vision Financial shall not be liable for indirect,
            incidental, or consequential damages arising from your use of this website.
          </p>

          <h2>Changes</h2>
          <p>
            We may update these Terms from time to time. Continued use of the site after changes
            become effective constitutes acceptance of the revised Terms.
          </p>

          <h2>Contact</h2>
          <p>
            For questions about these Terms, contact{" "}
            <a href="mailto:legal@teamvisionfinancial.com">legal@teamvisionfinancial.com</a>.
            {/* TODO: Replace with official legal contact email. */}
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
