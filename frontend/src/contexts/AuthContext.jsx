import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  bootstrapAtlasSession,
  clearSession,
  fetchCurrentUser,
  getStoredSessionToken,
  loginWithEmail,
  signupWithEmail,
  storeSessionToken
} from "../services/atlasAuthService";
import { fetchOnboardingStatus } from "../services/onboardingService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [onboarding, setOnboarding] = useState(null);

  const refresh = useCallback(async () => {
    const token = getStoredSessionToken();

    if (!token) {
      setUser(null);
      setOrganization(null);
      setOnboarding(null);
      return null;
    }

    try {
      const status = await fetchOnboardingStatus();
      setUser(status.user);
      setOrganization(status.organization);
      setOnboarding(status);
      return status;
    } catch {
      clearSession();
      setUser(null);
      setOrganization(null);
      setOnboarding(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        await bootstrapAtlasSession();
        if (active) {
          await refresh();
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      active = false;
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      loading,
      user,
      organization,
      onboarding,
      isAuthenticated: Boolean(user),
      isActivated: Boolean(organization?.activatedAt),
      refresh,
      async signup(payload) {
        const result = await signupWithEmail(payload);
        storeSessionToken(result.token);
        await refresh();
        return result;
      },
      async login(payload) {
        const result = await loginWithEmail(payload);
        storeSessionToken(result.token);
        const status = await refresh();
        return { ...result, status };
      },
      logout() {
        clearSession();
        setUser(null);
        setOrganization(null);
        setOnboarding(null);
      }
    }),
    [loading, user, organization, onboarding, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
