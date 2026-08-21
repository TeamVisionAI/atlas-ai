import Navbar from "../components/public/Navbar";
import Footer from "../components/public/Footer";
import { PUBLIC_SITE_BRAND } from "../config/publicSiteHost";
import { usePublicSiteBrand } from "../hooks/usePublicSiteBrand";
import { usePageMeta } from "../hooks/usePageMeta";
import "./PublicSite.css";

const SUPPORT_EMAIL = "support@teamvisionfinancial.com";
const LEGAL_EMAIL = "legal@teamvisionfinancial.com";

function TeamVisionTerms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="public-site__legal-updated">Last updated: July 2026</p>

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
        <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.
      </p>
    </>
  );
}

function AtlasTerms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="public-site__legal-updated">Last updated: August 2026</p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern access to and use of the Atlas AI
        software platform and related websites (including useatlas-ai.com and
        app.useatlas-ai.com). By accessing or using Atlas, you agree to these Terms.
      </p>

      <h2>Access and use of the software</h2>
      <p>
        Atlas provides multi-tenant software for recruiting, follow-up, scheduling, conversations,
        and related team operations. You may use Atlas only for lawful business purposes and in
        accordance with these Terms and any applicable order or workspace agreement.
      </p>
      <p>
        You must provide accurate account information, keep credentials confidential, and promptly
        notify us of unauthorized access.
      </p>

      <h2>Tenant responsibility for users and data</h2>
      <p>
        Each tenant organization is responsible for its authorized users, role assignments, and
        the prospect/contact and business data it submits to Atlas. Tenants are responsible for
        obtaining any consents required to process personal information through Atlas and for
        complying with applicable laws in their use of the platform.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Misuse the service, attempt unauthorized access, or disrupt platform integrity</li>
        <li>Upload unlawful, harmful, or infringing content</li>
        <li>Use Atlas to send spam or deceptive communications</li>
        <li>Probe, scan, or reverse engineer the service except as permitted by law</li>
        <li>Resell or sublicense access except as expressly allowed</li>
      </ul>

      <h2>Integrations</h2>
      <p>
        Atlas may offer optional integrations (for example Google Calendar and WhatsApp/Meta).
        Those services are governed by their own terms and privacy policies. You are responsible
        for configuring integrations lawfully and for disconnecting them when no longer authorized.
        Availability of third-party features depends on those providers.
      </p>

      <h2>AI-assisted features</h2>
      <p>
        Atlas may include AI-assisted conversation, qualification, or drafting features. Outputs
        can be incorrect or incomplete. Users remain responsible for reviewing AI-assisted content
        before relying on it for business decisions or customer communications.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We strive to keep Atlas available but do not guarantee uninterrupted service. We may
        modify, suspend, or discontinue features with reasonable notice when practicable. We may
        update these Terms; continued use after an update constitutes acceptance of the revised
        Terms.
      </p>

      <h2>Intellectual property</h2>
      <p>
        Atlas software, branding, and site content are owned by the Atlas platform operator or its
        licensors. These Terms do not transfer ownership of Atlas IP to you. Tenant data remains
        the tenant&apos;s (subject to any rights needed to operate the service).
      </p>

      <h2>Termination</h2>
      <p>
        We may suspend or terminate access for material breach, security risk, non-payment (where
        applicable), or unlawful use. You may stop using Atlas at any time. Provisions that by
        nature should survive (including disclaimers and limitations) will survive termination.
      </p>

      <h2>Disclaimers</h2>
      <p>
        Atlas is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis to the
        fullest extent permitted by law. We disclaim warranties of merchantability, fitness for a
        particular purpose, and non-infringement, except where such disclaimers are not allowed.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent permitted by law, the Atlas platform operator shall not be liable for
        indirect, incidental, special, consequential, or punitive damages, or for loss of profits,
        revenue, data, or business opportunities arising from your use of Atlas.
      </p>

      <h2>Contact and support</h2>
      <p>
        For questions about these Terms or support requests, contact{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        {" "}or{" "}
        <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.
      </p>
    </>
  );
}

export default function Terms() {
  const brand = usePublicSiteBrand();
  const isAtlas = brand === PUBLIC_SITE_BRAND.ATLAS;

  usePageMeta({
    title: isAtlas ? "Terms of Service | Atlas AI" : "Terms of Service | Team Vision Financial",
    description: isAtlas
      ? "Terms governing use of the Atlas AI software platform."
      : "Team Vision Financial terms of service."
  });

  return (
    <div className="public-site">
      <Navbar />
      <main id="main-content" className="public-site__legal">
        <div className="public-site__container">
          {isAtlas ? <AtlasTerms /> : <TeamVisionTerms />}
        </div>
      </main>
      <Footer />
    </div>
  );
}
