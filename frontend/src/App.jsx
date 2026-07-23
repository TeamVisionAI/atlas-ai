import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Dashboard from "./pages/Dashboard";
import ProspectWorkspace from "./pages/ProspectWorkspace";
import ProspectCenter from "./pages/ProspectCenter";
import WhatsAppConnect from "./pages/WhatsAppConnect";
import QuickCapture from "./pages/QuickCapture";
import PlaceholderPage from "./pages/PlaceholderPage";
import Prospect from "./pages/Prospect";
import Home from "./pages/Home";
import Privacy from "./pages/Privacy";
import Legal from "./pages/Legal";
import Terms from "./pages/Terms";
import DataDeletion from "./pages/DataDeletion";
import { appPath } from "./config/appRoutes";

function LegacyRedirect({ suffix = "" }) {
  const location = useLocation();
  return <Navigate to={`${appPath(suffix)}${location.search}`} replace />;
}

function LegacyProspectWorkspaceRedirect() {
  const { phone } = useParams();
  const location = useLocation();
  return (
    <Navigate
      to={`${appPath(`prospect-workspace/${encodeURIComponent(phone)}`)}${location.search}`}
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
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/data-deletion" element={<DataDeletion />} />

      <Route path="/app" element={<MainLayout />}>
        <Route index element={<ExecutiveDashboard />} />
        <Route path="mission-control" element={<Dashboard />} />
        <Route path="prospect-workspace/:phone" element={<ProspectWorkspace />} />
        <Route path="prospect-center" element={<ProspectCenter />} />
        <Route path="quick-capture" element={<QuickCapture />} />
        <Route path="prospect/:id" element={<Prospect />} />
        <Route path="pipeline" element={<Navigate to="/app/prospect-center" replace />} />
        <Route
          path="conversations"
          element={
            <PlaceholderPage
              titleKey="placeholderConversationsTitle"
              descriptionKey="placeholderConversationsDescription"
            />
          }
        />
        <Route
          path="appointments"
          element={
            <PlaceholderPage
              titleKey="placeholderAppointmentsTitle"
              descriptionKey="placeholderAppointmentsDescription"
            />
          }
        />
        <Route
          path="follow-ups"
          element={
            <PlaceholderPage
              titleKey="placeholderFollowUpsTitle"
              descriptionKey="placeholderFollowUpsDescription"
            />
          }
        />
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
          path="settings"
          element={
            <PlaceholderPage
              titleKey="placeholderSettingsTitle"
              descriptionKey="placeholderSettingsDescription"
              actionHref={appPath("settings/whatsapp")}
              actionLabelKey="whatsappConnectOpenFromSettings"
            />
          }
        />
        <Route path="settings/whatsapp" element={<WhatsAppConnect />} />
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
      <Route path="/pipeline" element={<Navigate to="/app/prospect-center" replace />} />
      <Route path="/prospect/:id" element={<LegacyProspectRedirect />} />
    </Routes>
  );
}
