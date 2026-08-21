import { useMemo } from "react";
import {
  PUBLIC_SITE_BRAND,
  resolvePublicSiteBrand
} from "../config/publicSiteHost";

/**
 * Brand for public chrome (navbar/footer/legal) on the current hostname.
 * App host still uses Atlas chrome for privacy/terms if visited there.
 */
export function usePublicSiteBrand() {
  return useMemo(() => {
    const brand = resolvePublicSiteBrand();
    if (brand === PUBLIC_SITE_BRAND.APP) {
      return PUBLIC_SITE_BRAND.ATLAS;
    }
    return brand;
  }, []);
}

export function useIsAtlasPublicBrand() {
  return usePublicSiteBrand() === PUBLIC_SITE_BRAND.ATLAS;
}
