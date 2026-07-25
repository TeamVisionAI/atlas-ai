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
  { path: appPath("knowledge"), labelKey: "navKnowledge" },
  { path: appPath("my-account"), labelKey: "navMyAccount" },
  { path: appPath("settings"), labelKey: "navSettings" }
];

export const adminNavItem = {
  path: appPath("admin/users"),
  labelKey: "navAdminUsers"
};

export const operationsCenterNavItem = {
  path: appPath("operations-center"),
  labelKey: "navOperationsCenter"
};
