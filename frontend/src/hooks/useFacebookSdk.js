import { useEffect, useState } from "react";

const SDK_SCRIPT_ID = "facebook-jssdk";
const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const WA_EMBEDDED_SIGNUP_DEBUG = "[WA_EMBEDDED_SIGNUP_DEBUG]";

let sdkPromise = null;

function loadFacebookSdk(appId, version) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Facebook SDK requires a browser environment."));
  }

  if (window.FB) {
    console.log(WA_EMBEDDED_SIGNUP_DEBUG, "Facebook SDK already available (window.FB present)");
    return Promise.resolve(window.FB);
  }

  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.fbAsyncInit = function fbAsyncInit() {
        try {
          console.log(WA_EMBEDDED_SIGNUP_DEBUG, "Immediately before FB.init()", { appId, version });
          window.FB.init({
            appId,
            cookie: true,
            xfbml: true,
            version
          });
          console.log(WA_EMBEDDED_SIGNUP_DEBUG, "Immediately after FB.init()", { appId, version });
          resolve(window.FB);
        } catch (error) {
          console.error(WA_EMBEDDED_SIGNUP_DEBUG, "FB.init() catch block", error);
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
      script.onload = () => {
        console.log(WA_EMBEDDED_SIGNUP_DEBUG, "Facebook SDK script finished loading", {
          src: SDK_SRC
        });
      };
      script.onerror = () => {
        const error = new Error("Failed to load Facebook SDK.");
        console.error(WA_EMBEDDED_SIGNUP_DEBUG, "Facebook SDK script onerror catch block", error);
        reject(error);
      };
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
    console.log(
      "Embedded Signup Config ID:",
      import.meta.env.VITE_META_EMBEDDED_SIGNUP_CONFIG_ID
    );

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
        console.error(WA_EMBEDDED_SIGNUP_DEBUG, "loadFacebookSdk catch block", err);

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
