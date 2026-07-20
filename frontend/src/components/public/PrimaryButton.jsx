import "./PrimaryButton.css";

export default function PrimaryButton({
  as = "button",
  href,
  type = "button",
  children,
  className = "",
  ...rest
}) {
  const classes = ["primary-button", className].filter(Boolean).join(" ");

  if (as === "a") {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
