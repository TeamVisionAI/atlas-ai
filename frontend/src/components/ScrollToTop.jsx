import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { scrollToElementById } from "../utils/scrollToElement";

/**
 * Scrolls to top on pathname changes across the public website.
 * Hash targets (e.g. /#contact) smooth-scroll after the destination route renders.
 */
export default function ScrollToTop() {
  const location = useLocation();
  const previousPathnameRef = useRef(location.pathname);
  const previousHashRef = useRef(location.hash);

  useEffect(() => {
    if (location.pathname.startsWith("/app")) {
      previousPathnameRef.current = location.pathname;
      previousHashRef.current = location.hash;
      return;
    }

    const pathnameChanged = location.pathname !== previousPathnameRef.current;
    const hashChanged = location.hash !== previousHashRef.current;

    previousPathnameRef.current = location.pathname;
    previousHashRef.current = location.hash;

    if (location.hash) {
      void scrollToElementById(location.hash.slice(1));
      return;
    }

    if (pathnameChanged || hashChanged) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname, location.hash, location.key]);

  return null;
}
