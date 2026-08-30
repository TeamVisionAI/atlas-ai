import Navbar from "../components/public/Navbar";
import Footer from "../components/public/Footer";
import { PUBLIC_SITE_BRAND } from "../config/publicSiteHost";
import { usePublicSiteBrand } from "../hooks/usePublicSiteBrand";
import { usePageMeta } from "../hooks/usePageMeta";
import {
  TEAM_VISION_CONTACT_PHONE_DISPLAY,
  TEAM_VISION_CONTACT_PHONE_TEL,
  TEAM_VISION_INFO_EMAIL,
  TEAM_VISION_PRIVACY_EMAIL,
  TEAM_VISION_SUPPORT_EMAIL,
  TEAM_VISION_WHATSAPP_DISCLOSURE_PARAGRAPHS,
  TEAM_VISION_WHATSAPP_SECTION_TITLE
} from "../config/teamVisionMessagingCompliance";
import "./PublicSite.css";

const SUPPORT_EMAIL = TEAM_VISION_SUPPORT_EMAIL;
const PRIVACY_EMAIL = TEAM_VISION_PRIVACY_EMAIL;

function TeamVisionPrivacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="public-site__legal-updated">Last updated: August 2026</p>

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
        We retain information only as long as necessary for the purposes described in this policy
        or as required by law.
      </p>

      <h2>{TEAM_VISION_WHATSAPP_SECTION_TITLE}</h2>
      {TEAM_VISION_WHATSAPP_DISCLOSURE_PARAGRAPHS.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      <h2>Your choices</h2>
      <p>
        You may request access, correction, or deletion of certain personal information by
        contacting us at <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>Contact</h2>
      <p>
        Team Vision Financial. Questions about this policy may be sent to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
        {", "}
        <a href={`mailto:${TEAM_VISION_INFO_EMAIL}`}>{TEAM_VISION_INFO_EMAIL}</a>
        {", or by phone at "}
        <a href={`tel:${TEAM_VISION_CONTACT_PHONE_TEL}`}>{TEAM_VISION_CONTACT_PHONE_DISPLAY}</a>.
      </p>
    </>
  );
}

function AtlasPrivacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="public-site__legal-updated">Last updated: August 2026</p>

      <p>
        This Privacy Policy describes how the Atlas AI software platform (&ldquo;Atlas,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares
        information when you visit useatlas-ai.com or use Atlas applications (including
        app.useatlas-ai.com).
      </p>
      <p>
        Atlas is a multi-tenant SaaS product. Tenant organizations control their own workspaces,
        users, and prospect/contact data. This policy covers platform-level processing; tenant
        organizations may have additional obligations under their own policies.
      </p>

      <h2>Information we collect</h2>
      <h3>Account and workspace data</h3>
      <p>When you create or join an Atlas workspace, we may process:</p>
      <ul>
        <li>Name, email address, and authentication credentials</li>
        <li>Organization/workspace profile settings and role assignments</li>
        <li>Usage and diagnostic logs needed to operate and secure the service</li>
      </ul>

      <h3>Prospect and contact data processed for tenant organizations</h3>
      <p>
        Tenant users may enter or import prospect and contact information (for example names, phone
        numbers, conversation history, appointment details, and workflow notes). Atlas processes
        that data on behalf of the tenant organization to provide recruiting, follow-up,
        scheduling, and related features. Tenants remain responsible for the lawfulness of data
        they submit.
      </p>

      <h3>Google Calendar integration data</h3>
      <p>
        If a workspace connects Google Calendar, Atlas may access calendar availability and event
        details needed to create, update, or sync appointments that the tenant authorizes. Access
        occurs only after Google OAuth consent by an authorized user, and can be revoked by
        disconnecting the integration.
      </p>

      <h3>WhatsApp / Meta integration data</h3>
      <p>
        If a workspace connects WhatsApp Business through Meta Embedded Signup, Atlas may process
        message content, delivery metadata, and related business account identifiers required to
        send and receive messages for that tenant. Atlas does not bypass Meta authentication and
        only accesses data after the customer authorizes the connection.
      </p>

      <h3>Website technical data</h3>
      <p>
        On our public site we may collect standard technical data such as browser type, device
        information, IP address, and usage logs.
      </p>

      <h2>Purpose of processing</h2>
      <ul>
        <li>Provide, operate, and secure the Atlas platform</li>
        <li>Enable tenant features such as conversations, scheduling, reminders, and dashboards</li>
        <li>Support authentication, invitations, and account recovery</li>
        <li>Respond to support and privacy requests</li>
        <li>Comply with applicable legal obligations</li>
        <li>Improve reliability and diagnose incidents</li>
      </ul>

      <h2>Service providers</h2>
      <p>
        We use infrastructure and communications providers to host the application, store data,
        deliver messages, and support operations (for example cloud hosting, email, and Meta/Google
        APIs when a tenant connects those integrations). Providers process data only as needed to
        deliver their services under contractual safeguards.
      </p>
      <p>We do not sell personal information.</p>

      <h2>Google API Services User Data Policy</h2>
      <p>
        Atlas&apos;s use and transfer of information received from Google APIs will adhere to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Google user data obtained through Google APIs is
        used to provide or improve user-facing features that are prominent in the requesting
        application&apos;s user interface, and is not used for advertising or sold to third parties.
      </p>

      <h2>Security</h2>
      <p>
        We apply administrative and technical safeguards appropriate to the nature of the service,
        including access controls, encrypted transport (HTTPS), and tenant isolation practices.
        No method of transmission or storage is completely secure.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We retain account and operational data for as long as needed to provide the service and meet
        legal, security, or accounting requirements. Tenant administrators and individuals may
        request deletion as described on our{" "}
        <a href="/data-deletion">Data Deletion</a> page. Some records may be retained when required
        by law or for dispute resolution and fraud prevention.
      </p>

      <h2>Your rights and contact</h2>
      <p>
        Depending on applicable law, you may request access, correction, or deletion of personal
        information we hold about you. Contact{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> or{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Workspace members should also
        contact their organization administrator for data controlled by that tenant.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. The &ldquo;Last updated&rdquo; date
        above reflects the latest revision posted on this site.
      </p>
    </>
  );
}

export default function Privacy() {
  const brand = usePublicSiteBrand();
  const isAtlas = brand === PUBLIC_SITE_BRAND.ATLAS;

  usePageMeta({
    title: isAtlas ? "Privacy Policy | Atlas AI" : "Privacy Policy | Team Vision Financial",
    description: isAtlas
      ? "How Atlas AI collects, uses, and protects account, prospect, Google Calendar, and WhatsApp data."
      : "How Team Vision Financial collects, uses, and protects information, including WhatsApp and SMS communications."
  });

  return (
    <div className="public-site">
      <Navbar />
      <main id="main-content" className="public-site__legal">
        <div className="public-site__container">
          {isAtlas ? <AtlasPrivacy /> : <TeamVisionPrivacy />}
        </div>
      </main>
      <Footer />
    </div>
  );
}
