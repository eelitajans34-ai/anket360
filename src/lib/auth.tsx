import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { db } from "@/lib/data";
import type { Organization, OrgRole, SignUpInput, User } from "@/lib/types";

type OrgWithRole = Organization & { role: OrgRole };

interface AuthState {
  loading: boolean;
  user: User | null;
  organizations: OrgWithRole[];
  activeOrg: OrgWithRole | null;
  setActiveOrg(id: string): void;
  signIn(email: string, password: string): Promise<User>;
  /** E-posta doğrulaması gerekiyorsa null döner. */
  signUp(input: SignUpInput): Promise<User | null>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const ACTIVE_ORG_KEY = "anket360:active-org";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrgWithRole[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => localStorage.getItem(ACTIVE_ORG_KEY));

  const loadFor = useCallback(async (u: User | null) => {
    setUser(u);
    setOrganizations(u ? await db.listMyOrganizations(u.id) : []);
  }, []);

  const refresh = useCallback(async () => {
    await loadFor(await db.currentUser());
  }, [loadFor]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    return db.onAuthChange?.(() => void refresh());
  }, [refresh]);

  const setActiveOrg = useCallback((id: string) => {
    localStorage.setItem(ACTIVE_ORG_KEY, id);
    setActiveOrgId(id);
  }, []);

  const value = useMemo<AuthState>(() => {
    const activeOrg = organizations.find((o) => o.id === activeOrgId) ?? organizations[0] ?? null;
    return {
      loading,
      user,
      organizations,
      activeOrg,
      setActiveOrg,
      refresh,
      async signIn(email, password) {
        const u = await db.signIn(email, password);
        await loadFor(u);
        return u;
      },
      async signUp(input) {
        const u = await db.signUp(input);
        await loadFor(u);
        return u;
      },
      async signOut() {
        await db.signOut();
        localStorage.removeItem(ACTIVE_ORG_KEY);
        setActiveOrgId(null);
        await loadFor(null);
      },
    };
  }, [loading, user, organizations, activeOrgId, setActiveOrg, refresh, loadFor]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return ctx;
}
