import { useEffect, useState } from "react";

const SDK_SCRIPT_ID = "facebook-jssdk";
const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

let sdkPromise = null;

function loadFacebookSdk(appId, version) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Facebook SDK requires a browser environment."));
  }

  if (window.FB) {
    return Promise.resolve(window.FB);
  }

  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.fbAsyncInit = function fbAsyncInit() {
        try {
          window.FB.init({
            appId,
            cookie: true,
            xfbml: true,
            version
          });
          resolve(window.FB);
        } catch (error) {
          reject(error);
        }
      };

      if (document.getElementById(SDK_SCRIPT_ID)) {
        return;
      }

      const script = document.createElement("script");
      script.id = SDK_SCRIPT_ID;
      script.src = SDK_SRC;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error("Failed to load Facebook SDK."));
      document.body.appendChild(script);
    });
  }

  return sdkPromise;
}

export function useFacebookSdk() {
  const appId = import.meta.env.VITE_META_APP_ID;
  const version = import.meta.env.VITE_META_GRAPH_API_VERSION || "v21.0";
  const configId = import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!appId || !configId) {
      setError("missing_config");
      return;
    }

    let cancelled = false;

    loadFacebookSdk(appId, version)
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      })
      .catch((err) => {
        console.error(err);

        if (!cancelled) {
          setError("sdk_load_failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appId, version, configId]);

  return {
    ready,
    error,
    appId,
    configId,
    version
  };
}
