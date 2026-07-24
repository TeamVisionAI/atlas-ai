import { forwardRef } from "react";
import Spinner from "./Spinner";

const AtlasButton = forwardRef(function AtlasButton(
  {
    children,
    variant = "secondary",
    type = "button",
    busy = false,
    disabled = false,
    className = "",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`atlas-ui-button atlas-ui-button--${variant} ${className}`.trim()}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <Spinner inline label="Loading" /> : null}
      {children}
    </button>
  );
});

export default AtlasButton;
