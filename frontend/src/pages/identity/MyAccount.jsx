import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import { canManageUsers, getUserManagementPath } from "../../config/workspaceExperience";
import {
  changeAccountPassword,
  fetchAccountProfile,
  fetchAccountSessions,
  logoutAllSessions,
  logoutCurrentSession,
  removeAccountPhoto,
  updateAccountProfile,
  uploadAccountPhoto
} from "../../services/accountService";
import {
  getAgentNotificationPreferences,
  updateAgentNotificationPreferences
} from "../../services/agentNotificationService";
import { logoutAtlasSession, storeSessionToken } from "../../services/atlasAuthService";
import ProfilePhotoEditor from "../../components/ui/ProfilePhotoEditor";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import "./identity.css";

const TABS = ["profile", "security", "sessions"];

export default function MyAccount() {
  const navigate = useNavigate();
  const { refreshUser, user: sessionUser } = useWorkspace();
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: ""
  });
  const [photoUploading, setPhotoUploading] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState(null);

  async function loadProfile() {
    const result = await fetchAccountProfile();
    setProfile(result.profile);
  }

  async function loadSessions() {
    const result = await fetchAccountSessions();
    setSessions(result.sessions || []);
  }

  useEffect(() => {
    loadProfile().catch((loadError) => setError(loadError.message));
    getAgentNotificationPreferences()
      .then((result) => setNotificationPrefs(result.preferences || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "sessions") {
      loadSessions().catch((loadError) => setError(loadError.message));
    }
  }, [tab]);

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const result = await updateAccountProfile({
        firstName: profile.first_name,
        lastName: profile.last_name,
        phone: profile.phone,
        timezone: profile.timezone
      });
      setProfile(result.profile);
      setMessage("Profile updated.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handlePhotoUpload(file) {
    setPhotoUploading(true);
    setError("");
    setMessage("");

    try {
      const result = await uploadAccountPhoto(file);
      setProfile(result.profile);
      await refreshUser();
      setMessage("Profile photo updated.");
    } catch (uploadError) {
      setError(uploadError.message);
      throw uploadError;
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handlePhotoRemove() {
    setPhotoUploading(true);
    setError("");
    setMessage("");

    try {
      const result = await removeAccountPhoto();
      setProfile(result.profile);
      await refreshUser();
      setMessage("Profile photo removed.");
    } catch (removeError) {
      setError(removeError.message);
      throw removeError;
    } finally {
      setPhotoUploading(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await changeAccountPassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setMessage("Password changed.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handleLogoutCurrent() {
    await logoutCurrentSession();
    await logoutAtlasSession();
    navigate(appPath("login"));
  }

  async function handleLogoutAll() {
    await logoutAllSessions();
    await logoutAtlasSession();
    navigate(appPath("login"));
  }

  if (!profile) {
    return <div className="identity-page">Loading account…</div>;
  }

  return (
    <div className="identity-page">
      <div className="identity-header">
        <div>
          <h1>My Account</h1>
          <p>{profile.email}</p>
        </div>
        {canManageUsers(profile) ? (
          <Link className="identity-button-secondary" to={getUserManagementPath(sessionUser || profile)}>
            Administration
          </Link>
        ) : null}
      </div>

      <div className="identity-tabs">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={`identity-tab ${tab === item ? "active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {message ? <p className="identity-success">{message}</p> : null}
      {error ? <p className="identity-error">{error}</p> : null}

      {tab === "profile" ? (
        <div className="identity-card">
          <ProfilePhotoEditor
            profile={profile}
            onUpload={handlePhotoUpload}
            onRemove={handlePhotoRemove}
            uploading={photoUploading}
          />
          <form className="identity-form" onSubmit={saveProfile}>
            <label>
              First Name
              <input
                value={profile.first_name || ""}
                onChange={(event) => setProfile({ ...profile, first_name: event.target.value })}
              />
            </label>
            <label>
              Last Name
              <input
                value={profile.last_name || ""}
                onChange={(event) => setProfile({ ...profile, last_name: event.target.value })}
              />
            </label>
            <label>
              Rep ID
              <input value={profile.rep_id || "—"} readOnly disabled />
            </label>
            <label>
              Phone
              <input
                value={profile.phone || ""}
                onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
              />
            </label>
            <label>
              Timezone
              <input
                value={profile.timezone || ""}
                onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}
              />
            </label>
            <p>Last login: {profile.last_login_at ? new Date(profile.last_login_at).toLocaleString() : "—"}</p>
            <button type="submit" className="identity-button">
              Save Profile
            </button>
          </form>
          {notificationPrefs ? (
            <form
              className="identity-form"
              style={{ marginTop: "1.5rem" }}
              onSubmit={async (event) => {
                event.preventDefault();
                const result = await updateAgentNotificationPreferences(notificationPrefs);
                setNotificationPrefs(result.preferences);
                setMessage("Notification preferences updated.");
              }}
            >
              <h3>Notifications</h3>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(notificationPrefs.inAppEnabled)}
                  onChange={(event) =>
                    setNotificationPrefs({
                      ...notificationPrefs,
                      inAppEnabled: event.target.checked
                    })
                  }
                />
                In-app notifications
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(notificationPrefs.soundEnabled)}
                  onChange={(event) =>
                    setNotificationPrefs({
                      ...notificationPrefs,
                      soundEnabled: event.target.checked
                    })
                  }
                />
                Notification sound
              </label>
              <button type="submit" className="identity-button-secondary">
                Save notification preferences
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {tab === "security" ? (
        <div className="identity-card">
          <form className="identity-form" onSubmit={savePassword}>
            <label>
              Current Password
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
                }
                required
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm({ ...passwordForm, newPassword: event.target.value })
                }
                required
              />
            </label>
            <button type="submit" className="identity-button">
              Change Password
            </button>
          </form>
        </div>
      ) : null}

      {tab === "sessions" ? (
        <div className="identity-card">
          <div className="identity-actions" style={{ marginBottom: "1rem" }}>
            <button type="button" className="identity-button-secondary" onClick={handleLogoutCurrent}>
              Logout Current Device
            </button>
            <button type="button" className="identity-button" onClick={handleLogoutAll}>
              Logout All Devices
            </button>
          </div>
          <table className="identity-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>IP</th>
                <th>Created</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.current ? "Current session" : session.user_agent || "Unknown device"}</td>
                  <td>{session.ip_address || "—"}</td>
                  <td>{new Date(session.created_at).toLocaleString()}</td>
                  <td>{new Date(session.expires_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
