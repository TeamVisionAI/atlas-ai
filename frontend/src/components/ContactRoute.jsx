import { Navigate } from "react-router-dom";
import AtlasContact from "../pages/AtlasContact";
import {
  PUBLIC_SITE_BRAND,
  resolvePublicSiteBrand
} from "../config/publicSiteHost";

/**
 * Atlas marketing/app hosts serve the Atlas support form.
 * Team Vision marketing keeps the homepage #contact section as the primary form.
 */
export default function ContactRoute() {
  const brand = resolvePublicSiteBrand();

  if (brand === PUBLIC_SITE_BRAND.TEAM_VISION) {
    return <Navigate to="/#contact" replace />;
  }

  return <AtlasContact />;
}
