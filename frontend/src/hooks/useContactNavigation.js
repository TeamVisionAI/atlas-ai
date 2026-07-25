import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { scrollToElementById } from "../utils/scrollToElement";

const CONTACT_HASH = "#contact";
const CONTACT_ID = "contact";

/**
 * SPA-safe navigation to the public site contact form.
 * On "/" scrolls in place; from other public routes navigates to "/#contact".
 */
export function useContactNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (event) => {
      event?.preventDefault();

      if (location.pathname === "/") {
        window.history.replaceState(null, "", `/${CONTACT_HASH}`);
        void scrollToElementById(CONTACT_ID);
        return;
      }

      navigate({ pathname: "/", hash: CONTACT_HASH });
    },
    [location.pathname, navigate]
  );
}
