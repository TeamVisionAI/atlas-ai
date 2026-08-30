import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  listAgentNotifications,
  markAgentNotificationRead,
  markAllAgentNotificationsRead,
  getAgentNotificationPreferences,
  updateAgentNotificationPreferences
} from "../../services/agentNotificationService";
import {
  playAgentNotificationChime,
  shouldPlayIncomingChime
} from "../../engines/agentNotificationSound";
import "./NotificationBell.css";

export default function NotificationBell({ enabled = true }) {
  const { translate } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const seenIdsRef = useRef(null);
  const panelRef = useRef(null);

  async function refresh({ playSound = true } = {}) {
    const [feed, prefs] = await Promise.all([
      listAgentNotifications(),
      getAgentNotificationPreferences()
    ]);
    const notifications = feed.notifications || [];
    const incomingUnread = Number(feed.unreadCount || 0);
    const prefsSound = Boolean(prefs.preferences?.soundEnabled);
    const isInitialLoad = seenIdsRef.current === null;
    if (
      playSound &&
      shouldPlayIncomingChime({
        soundEnabled: prefsSound,
        previousIds: seenIdsRef.current || [],
        incoming: notifications,
        isInitialLoad
      })
    ) {
      playAgentNotificationChime();
    }
    seenIdsRef.current = notifications.map((item) => item.id);
    setItems(notifications);
    setUnreadCount(incomingUnread);
    setSoundEnabled(prefsSound);
  }

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    refresh({ playSound: false }).catch(() => {});
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function onDocClick(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!enabled) {
    return null;
  }

  async function openNotification(item) {
    if (!item.readAt) {
      await markAgentNotificationRead(item.id).catch(() => {});
    }
    setOpen(false);
    await refresh({ playSound: false }).catch(() => {});
    navigate(item.actionUrl || appPath("notifications"));
  }

  async function handleMarkAll() {
    await markAllAgentNotificationsRead().catch(() => {});
    await refresh({ playSound: false }).catch(() => {});
  }

  async function toggleSound() {
    const next = !soundEnabled;
    const result = await updateAgentNotificationPreferences({ soundEnabled: next });
    setSoundEnabled(Boolean(result.preferences?.soundEnabled));
  }

  return (
    <div className="notification-bell" ref={panelRef}>
      <button
        type="button"
        className="notification-bell__button"
        aria-label={translate("notificationsBellLabel")}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          refresh({ playSound: false }).catch(() => {});
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? (
          <span className="notification-bell__badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        ) : null}
      </button>
      {open ? (
        <div className="notification-bell__panel" role="dialog" aria-label={translate("notificationsTitle")}>
          <div className="notification-bell__toolbar">
            <strong>{translate("notificationsTitle")}</strong>
            <button type="button" onClick={handleMarkAll}>
              {translate("notificationsMarkAllRead")}
            </button>
          </div>
          <ul className="notification-bell__list">
            {items.length === 0 ? (
              <li className="notification-bell__empty">{translate("notificationsEmpty")}</li>
            ) : (
              items.slice(0, 12).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notification-bell__item${item.readAt ? "" : " is-unread"}`}
                    onClick={() => openNotification(item)}
                  >
                    <span className="notification-bell__item-title">{item.title}</span>
                    <span className="notification-bell__item-body">{item.body}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="notification-bell__footer">
            <label>
              <input type="checkbox" checked={soundEnabled} onChange={toggleSound} />
              {translate("notificationsSoundToggle")}
            </label>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(appPath("notifications"));
              }}
            >
              {translate("notificationsViewAll")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
