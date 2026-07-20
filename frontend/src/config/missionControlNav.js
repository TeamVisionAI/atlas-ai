import { appPath } from "./appRoutes";

export const missionControlNav = [
  { path: appPath(), labelKey: "navExecutiveDashboard", end: true },
  { path: appPath("quick-capture"), labelKey: "navQuickCapture" },
  { path: appPath("mission-control"), labelKey: "navMissionControl" },
  { path: appPath("prospect-center"), labelKey: "navProspectCenter" },
  { path: appPath("conversations"), labelKey: "navConversations" },
  { path: appPath("appointments"), labelKey: "navAppointments" },
  { path: appPath("follow-ups"), labelKey: "navFollowUps" },
  { path: appPath("analytics"), labelKey: "navAnalytics" },
  { path: appPath("settings"), labelKey: "navSettings" }
];
