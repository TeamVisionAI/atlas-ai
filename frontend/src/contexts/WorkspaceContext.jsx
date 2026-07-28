import { createContext, useContext } from "react";

export const WorkspaceContext = createContext({
  user: null,
  operationsAllowed: false,
  workspaceType: "representative",
  navItems: [],
  landingPath: "/app/my-dashboard",
  refreshUser: async () => null
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
