import { Navigate } from "react-router-dom";
import Home from "../pages/Home";
import AtlasPublicHome from "../pages/AtlasPublicHome";
import { resolvePublicRootDecision } from "../config/publicSiteHost";
import { appPath } from "../config/appRoutes";

export default function PublicRoot() {
  const decision = resolvePublicRootDecision();

  if (decision.kind === "redirect") {
    return <Navigate to={appPath("login")} replace />;
  }

  if (decision.kind === "atlas_home") {
    return <AtlasPublicHome />;
  }

  return <Home />;
}
