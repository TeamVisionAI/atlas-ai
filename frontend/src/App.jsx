import { lazy } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Dashboard from "./pages/Dashboard";
import ProspectWorkspace from "./pages/ProspectWorkspace";
import ProspectCenter from "./pages/ProspectCenter";
import ConfigurationLayout from "./pages/configuration/ConfigurationLayout";
import ConfigurationHub from "./pages/configuration/ConfigurationHub";
import WhatsAppConnect from "./pages/WhatsAppConnect";
import WhatsAppConnectSuccess from "./pages/WhatsAppConnectSuccess";
import WhatsAppConnectError from "./pages/WhatsAppConnectError";
import QuickCapture from "./pages/QuickCapture";
import KnowledgeHub from "./pages/KnowledgeHub";
import OperationsCenter from "./pages/OperationsCenter";
import Login from "./pages/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import AcceptInvitation from "./pages/auth/AcceptInvitation";
import AdminUsers from "./pages/identity/AdminUsers";
import PlatformTenantsPage from "./pages/platform/PlatformTenantsPage";
import MyAccount from "./pages/identity/MyAccount";
import SetupWizard from "./pages/identity/SetupWizard";
import RequireSetupComplete from "./components/RequireSetupComplete";
import RequireAuth from "./components/RequireAuth";
import { WorkspaceLandingRedirect } from "./components/RequireWorkspaceAccess";
import MyDashboard from "./pages/MyDashboard";
import TeamDashboard from "./pages/TeamDashboard";
import PlaceholderPage from "./pages/PlaceholderPage";
import PolicyIntelligence from "./pages/PolicyIntelligence";
import PolicyIntelligencePreviewPage from "./pages/PolicyIntelligencePreviewPage";
import AppointmentsPage from "./pages/AppointmentsPage";
import FollowUpsPage from "./pages/FollowUpsPage";
import ConversationsPage from "./pages/ConversationsPage";
import Prospect from "./pages/Prospect";
import Home from "./pages/Home";
import AtlasLanding from "./pages/AtlasLanding";
import Privacy from "./pages/Privacy";
import Legal from "./pages/Legal";
import Terms from "./pages/Terms";
import DataDeletion from "./pages/DataDeletion";
import { appPath } from "./config/appRoutes";
import { buildProspectWorkspacePath } from "./utils/prospectRoutes";
import {
  POLICY_INTELLIGENCE_PREVIEW_ALIAS_PATH,
  POLICY_INTELLIGENCE_PREVIEW_PATH
} from "./config/internalPreview";

const ProfileConfiguration = lazy(() => import("./pages/configuration/ProfileConfiguration"));
const OrganizationConfiguration = lazy(() => import("./pages/configuration/OrganizationConfiguration"));
const IntegrationsConfiguration = lazy(() => import("./pages/configuration/IntegrationsConfiguration"));
const SchedulingConfiguration = lazy(() => import("./pages/configuration/SchedulingConfiguration"));
const AppointmentSettings = lazy(() => import("./pages/configuration/AppointmentSettings"));
const QrCampaignsConfiguration = lazy(() =>
  import("./pages/configuration/QrCampaignsConfiguration")
);
const RecruitingConfiguration = lazy(() => import("./pages/configuration/RecruitingConfiguration"));

function LegacyRedirect({ suffix = "" }) {
  const location = useLocation();
  return <Navigate to={`${appPath(suffix)}${location.search}`} replace />;
}

function LegacyProspectWorkspaceRedirect() {
  const { phone } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`${buildProspectWorkspacePath(phone)}${location.search}`}
      replace
    />
  );
}

function LegacyProspectRedirect() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`${appPath(`prospect/${encodeURIComponent(id)}`)}${location.search}`}
      replace
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/atlas" element={<AtlasLanding />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/data-deletion" element={<DataDeletion />} />
      <Route path="/app/login" element={<Login />} />
      <Route path="/app/setup" element={<SetupWizard />} />
      <Route path="/app/forgot-password" element={<ForgotPassword />} />
      <Route path="/app/reset-password" element={<ResetPassword />} />
      <Route path="/app/accept-invitation" element={<AcceptInvitation />} />

      {/* Dev-only PI Executive Review preview — outside /app so Meta Review nav is untouched */}
      <Route path={POLICY_INTELLIGENCE_PREVIEW_PATH} element={<PolicyIntelligencePreviewPage />} />
      <Route
        path={POLICY_INTELLIGENCE_PREVIEW_ALIAS_PATH}
        element={<PolicyIntelligencePreviewPage />}
      />

      <Route
        path="/app"
        element={
          <RequireSetupComplete>
            <RequireAuth>
              <MainLayout />
            </RequireAuth>
          </RequireSetupComplete>
        }
      >
        <Route index element={<WorkspaceLandingRedirect />} />
        <Route path="executive-dashboard" element={<ExecutiveDashboard />} />
        <Route path="my-dashboard" element={<MyDashboard />} />
        <Route path="team-dashboard" element={<TeamDashboard />} />
        <Route path="mission-control" element={<Dashboard />} />
        <Route path="prospect-workspace/:phone" element={<ProspectWorkspace />} />
        <Route path="prospect-center" element={<ProspectCenter />} />
        <Route path="quick-capture" element={<QuickCapture />} />
        <Route path="prospect/:id" element={<Prospect />} />
        <Route path="pipeline" element={<Navigate to="/app/prospect-center" replace />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route
          path="analytics"
          element={
            <PlaceholderPage
              titleKey="placeholderAnalyticsTitle"
              descriptionKey="placeholderAnalyticsDescription"
            />
          }
        />
        <Route
          path="production"
          element={
            <PlaceholderPage
              titleKey="placeholderProductionTitle"
              descriptionKey="placeholderProductionDescription"
            />
          }
        />
        <Route
          path="recruiting"
          element={
            <PlaceholderPage
              titleKey="placeholderRecruitingTitle"
              descriptionKey="placeholderRecruitingDescription"
            />
          }
        />
        <Route path="settings" element={<ConfigurationLayout />}>
          <Route index element={<ConfigurationHub />} />
          <Route path="profile" element={<ProfileConfiguration />} />
          <Route path="organization" element={<OrganizationConfiguration />} />
          <Route path="integrations" element={<IntegrationsConfiguration />} />
          <Route path="whatsapp" element={<WhatsAppConnect />} />
          <Route path="whatsapp/success" element={<WhatsAppConnectSuccess />} />
          <Route path="whatsapp/error" element={<WhatsAppConnectError />} />
          <Route path="scheduling" element={<SchedulingConfiguration />} />
          <Route path="recruiting" element={<RecruitingConfiguration />} />
          <Route path="appointments" element={<AppointmentSettings />} />
          <Route path="qr-campaigns" element={<QrCampaignsConfiguration />} />
        </Route>
        <Route path="knowledge" element={<KnowledgeHub />} />
        <Route path="policy-intelligence" element={<PolicyIntelligence />} />
        <Route path="my-account" element={<MyAccount />} />
        <Route path="admin/users" element={<AdminUsers />} />
        <Route path="platform/tenants" element={<PlatformTenantsPage />} />
        <Route path="operations-center/*" element={<OperationsCenter />} />
      </Route>

      {/* Legacy redirects — preserve bookmarks and hardcoded in-app links */}
      <Route path="/mission-control" element={<LegacyRedirect suffix="mission-control" />} />
      <Route path="/prospect-center" element={<LegacyRedirect suffix="prospect-center" />} />
      <Route path="/prospect-workspace/:phone" element={<LegacyProspectWorkspaceRedirect />} />
      <Route path="/quick-capture" element={<Navigate to="/app/quick-capture" replace />} />
      <Route path="/conversations" element={<Navigate to="/app/conversations" replace />} />
      <Route path="/appointments" element={<Navigate to="/app/appointments" replace />} />
      <Route path="/follow-ups" element={<Navigate to="/app/follow-ups" replace />} />
      <Route path="/analytics" element={<Navigate to="/app/analytics" replace />} />
      <Route path="/settings/whatsapp" element={<Navigate to="/app/settings/whatsapp" replace />} />
      <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
      <Route path="/knowledge" element={<Navigate to="/app/knowledge" replace />} />
      <Route path="/policy-intelligence" element={<Navigate to="/app/policy-intelligence" replace />} />
      <Route path="/pipeline" element={<Navigate to="/app/prospect-center" replace />} />
      <Route path="/prospect/:id" element={<LegacyProspectRedirect />} />
    </Routes>
  );
}
