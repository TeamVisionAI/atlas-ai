import Navbar from "../components/public/Navbar";
import Footer from "../components/public/Footer";
import "./PublicSite.css";

export default function Privacy() {
  return (
    <div className="public-site">
      <Navbar />
      <main id="main-content" className="public-site__legal">
        <div className="public-site__container">
          <h1>Privacy Policy</h1>
          <p className="public-site__legal-updated">Last updated: {/* TODO: Set official publish date. */} July 2026</p>

          <p>
            Team Vision Financial (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) respects your
            privacy. This Privacy Policy describes how we collect, use, and protect information when
            you visit our website or use our services.
          </p>

          <h2>Information we collect</h2>
          <p>
            We may collect information you provide directly, such as your name, email address, phone
            number, and messages submitted through contact forms. We may also collect standard
            technical data such as browser type, device information, and usage logs.
          </p>

          <h2>How we use information</h2>
          <ul>
            <li>To respond to inquiries and provide requested services</li>
            <li>To operate, maintain, and improve our website and internal tools</li>
            <li>To comply with legal and regulatory obligations</li>
            <li>To protect the security and integrity of our systems</li>
          </ul>

          <h2>Sharing of information</h2>
          <p>
            We do not sell personal information. We may share information with service providers who
            assist in hosting, communications, or compliance, subject to appropriate safeguards.
          </p>

          <h2>Data retention</h2>
          <p>
            {/* TODO: Confirm retention schedule with legal/compliance before production launch. */}
            We retain information only as long as necessary for the purposes described in this policy
            or as required by law.
          </p>

          <h2>Your choices</h2>
          <p>
            You may request access, correction, or deletion of certain personal information by
            contacting us at{" "}
            <a href="mailto:privacy@teamvisionfinancial.com">privacy@teamvisionfinancial.com</a>.
            {/* TODO: Replace with official privacy contact email. */}
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy may be sent to{" "}
            <a href="mailto:privacy@teamvisionfinancial.com">privacy@teamvisionfinancial.com</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
