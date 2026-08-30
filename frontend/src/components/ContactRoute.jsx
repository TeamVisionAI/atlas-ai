import AtlasContact from "../pages/AtlasContact";
import TeamVisionContact from "../pages/TeamVisionContact";
import {
  PUBLIC_SITE_BRAND,
  resolvePublicSiteBrand
} from "../config/publicSiteHost";

/**
 * Atlas marketing/app hosts serve the Atlas support form.
 * Team Vision marketing serves a crawlable /contact page (homepage also keeps #contact).
 */
export default function ContactRoute() {
  const brand = resolvePublicSiteBrand();

  if (brand === PUBLIC_SITE_BRAND.TEAM_VISION) {
    return <TeamVisionContact />;
  }

  return <AtlasContact />;
}
