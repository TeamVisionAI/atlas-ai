import { Link } from "react-router-dom";
import Navbar from "../components/public/Navbar";
import Footer from "../components/public/Footer";
import { usePageMeta } from "../hooks/usePageMeta";
import "./PublicSite.css";

const PRIVACY_EMAIL = "privacy@teamvisionfinancial.com";
const DELETION_MAILTO = `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent("Data Deletion Request")}`;

export default function DataDeletion() {
  usePageMeta({
    title: "Privacy & Data Deletion | Atlas AI",
    description:
      "Learn how to request deletion of your personal information and account data from Atlas AI."
  });

  return (
    <div className="public-site">
      <Navbar />
      <main id="main-content" className="public-site__legal">
        <div className="public-site__container">
          <header className="public-site__legal-hero">
            <h1>Privacy &amp; Data Deletion</h1>
            <p className="public-site__lead">
              Your privacy matters. Atlas AI gives you control over your personal information.
            </p>
            <p className="public-site__legal-updated">Last updated: July 23, 2026</p>
          </header>

          <h2>Request Data Deletion</h2>
          <p>
            If you would like Atlas AI to delete your personal information, account, or associated
            data, you may submit a deletion request at any time.
          </p>
          <p>
            Contact email:{" "}
            <a href={DELETION_MAILTO}>{PRIVACY_EMAIL}</a>
          </p>
          <p>
            Email subject: <strong>Data Deletion Request</strong>
          </p>
          <p>Ask the requester to include:</p>
          <ul>
            <li>Full name</li>
            <li>Email address</li>
            <li>Phone number, if applicable</li>
            <li>Organization, if applicable</li>
            <li>Any additional details that will help us locate the account or data</li>
          </ul>

          <h2>What Happens Next</h2>
          <p>
            After receiving the request, Atlas AI will verify the requester&apos;s identity and
            review the information associated with the account.
          </p>
          <p>Where applicable, Atlas AI will:</p>
          <ul>
            <li>Delete personal information from Atlas AI systems</li>
            <li>Remove the account and associated data</li>
            <li>Confirm completion by email</li>
          </ul>
          <p>Most verified requests should be processed within 30 days.</p>
          <p>
            Some information may be retained when required by applicable law, fraud-prevention
            requirements, security obligations, tax or accounting regulations, dispute resolution,
            or contractual obligations.
          </p>

          <h2>Third-Party Services</h2>
          <p>
            Atlas AI may integrate with third-party services such as Meta, Facebook, Messenger,
            Instagram, WhatsApp, and Google services.
          </p>
          <p>
            Deleting information from Atlas AI does not automatically delete information stored
            directly by those third-party providers. Users may need to manage or delete that
            information through the provider&apos;s own privacy and account settings.
          </p>

          <h2>Questions</h2>
          <p>
            For questions about privacy or data deletion, contact:{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
          </p>
          <p>
            See also our <Link to="/privacy">Privacy Policy</Link> and{" "}
            <Link to="/terms">Terms of Service</Link>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
