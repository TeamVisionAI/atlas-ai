import { getInitials } from "../../utils/userInitials";
import "./UserAvatar.css";

const SIZE_MAP = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 96
};

export default function UserAvatar({
  photoUrl,
  name = "",
  email = "",
  size = "md",
  className = "",
  title
}) {
  const dimension = SIZE_MAP[size] || SIZE_MAP.md;
  const label = name || email || "User";
  const initials = getInitials(name || email);
  const classes = ["user-avatar", `user-avatar--${size}`, className].filter(Boolean).join(" ");

  return (
    <span
      className={classes}
      style={{ width: dimension, height: dimension }}
      title={title || label}
      aria-label={label}
      role="img"
    >
      {photoUrl ? (
        <img className="user-avatar__image" src={photoUrl} alt="" loading="lazy" />
      ) : (
        <span className="user-avatar__initials" aria-hidden="true">
          {initials}
        </span>
      )}
    </span>
  );
}
