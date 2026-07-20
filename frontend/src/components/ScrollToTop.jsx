import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to top on pathname changes across the public website.
 * Hash-only navigation on the same page (e.g. /#about) is left to the browser.
 */
export default function ScrollToTop() {
  const location = useLocation();
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname.startsWith("/app")) {
      previousPathnameRef.current = location.pathname;
      return;
    }

    const pathnameChanged = location.pathname !== previousPathnameRef.current;
    previousPathnameRef.current = location.pathname;

    if (!pathnameChanged) {
      return;
    }

    if (location.hash) {
      requestAnimationFrame(() => {
        const target = document.getElementById(location.hash.slice(1));

        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
          return;
        }

        window.scrollTo({ top: 0, behavior: "auto" });
      });
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname, location.hash, location.key]);

  return null;
}
