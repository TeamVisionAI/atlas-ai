import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { appPath } from "../../config/appRoutes";
import { resolveAgentNotificationPath } from "../../engines/agentNotificationPath";
import { resolveNotificationPanelPlacement } from "../../engines/notificationBellPlacement";
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
  const [placement, setPlacement] = useState({ left: 8, top: 8, width: 360, maxHeight: 360 });
  const seenIdsRef = useRef(null);
  const triggerRef = useRef(null);
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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return undefined;
    }

    function reposition() {
      const next = resolveNotificationPanelPlacement({
        triggerRect: triggerRef.current.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        panelHeight: panelRef.current?.offsetHeight
      });
      setPlacement(next);
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function onDocClick(event) {
      const target = event.target;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
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
    navigate(resolveAgentNotificationPath(item));
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
    <div className="notification-bell">
      <button
        ref={triggerRef}
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
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="notification-bell__panel"
              role="dialog"
              aria-label={translate("notificationsTitle")}
              style={{
                left: placement.left,
                top: placement.top,
                width: placement.width,
                maxHeight: placement.maxHeight
              }}
            >
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
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
