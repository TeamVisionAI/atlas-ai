/** Settings module icons — stroke style consistent with Atlas landing icons. */

const ICONS = {
  profile: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  organization: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M4 9h16" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  whatsapp: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C6.48 2 2 6.03 2 11.17c0 1.8.48 3.55 1.39 5.09L2 22l6.02-1.58A9.86 9.86 0 0 0 12 20.34C17.52 20.34 22 16.31 22 11.17S17.52 2 12 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8.5 9.5c.28-.62 1.02-.8 1.48-.36.58.55 1.12 1.15 1.62 1.78.34.43.28 1.02-.12 1.38l-.72.62c.48.92 1.18 1.72 2.04 2.28l.66-.76c.36-.42.97-.48 1.4-.14.66.55 1.36 1.02 2.1 1.4.44.23.98.05 1.24-.38l.48-.82c.2-.34.12-.78-.2-1.02C15.8 12.6 14.2 11.72 12.68 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  scheduling: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 14h2v2H8v-2Zm4 0h2v2h-2v-2Z" fill="currentColor" />
    </svg>
  ),
  integrations: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4v2M15 4v2M9 18v2M15 18v2M4 9h2M4 15h2M18 9h2M18 15h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="7" y="7" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="7" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="13" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="13" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  recruiting: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1M16 3.5h4M18 1.5v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
};

export default function SettingsIcon({ name, size = 22 }) {
  const icon = ICONS[name];

  if (!icon) {
    return null;
  }

  if (size === 22) {
    return icon;
  }

  return (
    <span className="settings-icon" style={{ width: size, height: size }} aria-hidden="true">
      {icon}
    </span>
  );
}

export { ICONS as settingsIcons };
