import React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "teacher" | "student";

export type Profile = {
  user_id: string;
  email: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
};

type AuthContextValue = {
  session: Session | null;
  userId: string | null;
  roles: AppRole[];
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

async function ensureProfileForSession(session: Session): Promise<Profile | null> {
  const user = session.user;
  const userId = user.id;
  const email = user.email ?? "";
  const displayName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
    (email ? email.split("@")[0] : "User");

  const existing = await supabase
    .from("profiles")
    .select("user_id,email,display_name,bio,avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as Profile;

  const inserted = await supabase
    .from("profiles")
    .insert({
      user_id: userId,
      email,
      display_name: displayName,
      bio: null,
      avatar_url: null,
    })
    .select("user_id,email,display_name,bio,avatar_url")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data as Profile;
}

async function fetchMyRoles(): Promise<AppRole[]> {
  // security definer RPC, safe to call from client
  const res = await supabase.rpc("get_my_roles");
  if (res.error) throw res.error;
  return (res.data ?? []) as AppRole[];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [roles, setRoles] = React.useState<AppRole[]>([]);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error) throw error;

      setSession(session);
      if (!session) {
        setRoles([]);
        setProfile(null);
        return;
      }

      const [p, r] = await Promise.all([ensureProfileForSession(session), fetchMyRoles()]);
      setProfile(p);
      setRoles(r);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Re-sync profile/roles whenever auth changes.
      // Avoid awaiting here; kick off refresh.
      void refresh();
    });

    void refresh();
    return () => subscription.unsubscribe();
  }, [refresh]);

  const signInWithGoogle = React.useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = React.useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value: AuthContextValue = {
    session,
    userId: session?.user?.id ?? null,
    roles,
    profile,
    loading,
    signInWithGoogle,
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
