import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { appPath } from "../config/appRoutes";
import { useLanguage } from "../i18n/LanguageContext";
import {
  listAgentNotifications,
  markAgentNotificationRead,
  markAllAgentNotificationsRead
} from "../services/agentNotificationService";
import "../pages/identity/identity.css";

export default function NotificationsPage() {
  const { translate } = useLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  async function refresh() {
    const feed = await listAgentNotifications();
    setItems(feed.notifications || []);
  }

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, []);

  async function openItem(item) {
    if (!item.readAt) {
      await markAgentNotificationRead(item.id).catch(() => {});
    }
    navigate(item.actionUrl || appPath("conversations"));
  }

  return (
    <section className="identity-page">
      <header className="identity-header">
        <div>
          <h1>{translate("notificationsTitle")}</h1>
          <p>{translate("notificationsPageLede")}</p>
        </div>
        <button type="button" onClick={() => markAllAgentNotificationsRead().then(refresh)}>
          {translate("notificationsMarkAllRead")}
        </button>
      </header>
      {error ? <p className="identity-error">{error}</p> : null}
      {items.length === 0 ? (
        <p>{translate("notificationsEmpty")}</p>
      ) : (
        <ul className="identity-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.readAt ? "" : "is-unread"}
                onClick={() => openItem(item)}
              >
                <strong>{item.title}</strong>
                <span> {item.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
