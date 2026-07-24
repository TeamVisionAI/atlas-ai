import { createContext, useCallback, useContext, useMemo, useState } from "react";
import "../../styles/atlas-ui.css";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, tone = "info", duration = 4000 }) => {
      const id = crypto.randomUUID();

      setToasts((current) => [...current, { id, message, tone }]);

      window.setTimeout(() => {
        dismissToast(id);
      }, duration);
    },
    [dismissToast]
  );

  const value = useMemo(
    () => ({
      showToast,
      showSuccess: (message) => showToast({ message, tone: "success" }),
      showError: (message) => showToast({ message, tone: "error" }),
      showWarning: (message) => showToast({ message, tone: "warning" })
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="atlas-ui-toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div key={toast.id} className={`atlas-ui-toast atlas-ui-toast--${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return context;
}
