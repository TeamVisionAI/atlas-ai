import { Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import Dashboard from "./pages/Dashboard";
import QuickCapture from "./pages/QuickCapture";
import PlaceholderPage from "./pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<ExecutiveDashboard />} />
        <Route path="mission-control" element={<Dashboard />} />
        <Route path="prospect-workspace/:phone" element={<Dashboard />} />
        <Route path="quick-capture" element={<QuickCapture />} />
        <Route
          path="pipeline"
          element={
            <PlaceholderPage
              title="Pipeline"
              description="Prospect pipeline view coming soon."
            />
          }
        />
        <Route
          path="conversations"
          element={
            <PlaceholderPage
              title="Conversations"
              description="Live and historical conversations coming soon."
            />
          }
        />
        <Route
          path="appointments"
          element={
            <PlaceholderPage
              title="Appointments"
              description="Interview calendar and appointments coming soon."
            />
          }
        />
        <Route
          path="follow-ups"
          element={
            <PlaceholderPage
              title="Follow-ups"
              description="Follow-up queue and reminders coming soon."
            />
          }
        />
        <Route
          path="analytics"
          element={
            <PlaceholderPage
              title="Analytics"
              description="Recruiting metrics and reports coming soon."
            />
          }
        />
        <Route
          path="settings"
          element={
            <PlaceholderPage
              title="Settings"
              description="Team Vision and Atlas configuration coming soon."
            />
          }
        />
      </Route>
    </Routes>
  );
}
