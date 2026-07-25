import PrimaryButton from "./PrimaryButton";
import { useContactNavigation } from "../../hooks/useContactNavigation";

/**
 * CTA link/button that navigates to the homepage contact form with smooth scroll.
 */
export default function ContactLink({
  as,
  className = "",
  children,
  primary = false,
  ...rest
}) {
  const goToContact = useContactNavigation();

  if (primary || as === PrimaryButton) {
    return (
      <PrimaryButton type="button" className={className} onClick={goToContact} {...rest}>
        {children}
      </PrimaryButton>
    );
  }

  return (
    <a href="/#contact" className={className} onClick={goToContact} {...rest}>
      {children}
    </a>
  );
}
