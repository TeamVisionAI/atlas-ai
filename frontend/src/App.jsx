import { Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Dashboard from "./pages/Dashboard";
import ProspectWorkspace from "./pages/ProspectWorkspace";
import QuickCapture from "./pages/QuickCapture";
import PlaceholderPage from "./pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<ExecutiveDashboard />} />
        <Route path="mission-control" element={<Dashboard />} />
        <Route path="prospect-workspace/:phone" element={<ProspectWorkspace />} />
        <Route path="quick-capture" element={<QuickCapture />} />
        <Route
          path="pipeline"
          element={
            <PlaceholderPage
              titleKey="placeholderPipelineTitle"
              descriptionKey="placeholderPipelineDescription"
            />
          }
        />
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
            />
          }
        />
      </Route>
    </Routes>
  );
}
