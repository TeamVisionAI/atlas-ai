import { Link } from "react-router-dom";
import SettingsIcon from "../icons/SettingsIcons";

export default function SettingsCard({ to, title, description, icon, ariaLabel }) {
  return (
    <Link to={to} className="settings-card" aria-label={ariaLabel || `${title}: ${description}`}>
      <span className="settings-card__icon-wrap">
        <SettingsIcon name={icon} />
      </span>
      <span className="settings-card__body">
        <h2 className="settings-card__title">{title}</h2>
        <p className="settings-card__description">{description}</p>
      </span>
    </Link>
  );
}
