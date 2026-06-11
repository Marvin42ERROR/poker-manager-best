import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { store, subscribe } from "./poker-store";

export type AppRole = "creator" | "owner" | "manager" | "dealer" | "player";
// Legacy "admin" | "player" preserved for existing screens.
export type Role = "admin" | "player";

export interface ClubInfo {
  id: string;
  name: string;
  role: AppRole;
}

export interface Auth {
  // legacy compatibility for existing screens
  role: Role;
  name: string;

  // new fields
  userId: string;
  appRole: AppRole;
  /** Creator at the platform level (independent of any club membership). */
  isCreator: boolean;
  /** True when the active club was entered by a Creator (temporary owner-equivalent access). */
  supportMode: boolean;
  activeClubId: string | null;
  activeClubName: string | null;
  clubs: ClubInfo[];
}

const SNAPSHOT_KEY = "poker-auth-snapshot-v2";
const ACTIVE_CLUB_KEY = "poker-active-club-v2";
const SUPPORT_SESSION_KEY = "poker-support-session-v1";
const LAST_ACTIVITY_KEY = "poker-last-activity-v2";
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000; // 12 hours

let cached: Auth | null = null;
let initializing = true;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function legacyRoleFor(role: AppRole): Role {
  return role === "creator" || role === "owner" || role === "manager" ? "admin" : "player";
}

function readSnapshot(): Auth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as Auth) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(a: Auth | null) {
  if (typeof window === "undefined") return;
  if (a) localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(a));
  else localStorage.removeItem(SNAPSHOT_KEY);
}

if (typeof window !== "undefined") {
  cached = readSnapshot();
}

export function getAuth(): Auth | null {
  return cached;
}

export function isAuthInitializing(): boolean {
  return initializing;
}

export function getActiveClubId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_CLUB_KEY);
}

// ---- Support Mode (Creator-only) ---------------------------------------

function getSupportSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SUPPORT_SESSION_KEY);
}

function setSupportSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(SUPPORT_SESSION_KEY, id);
  else localStorage.removeItem(SUPPORT_SESSION_KEY);
}

async function endSupportSessionIfAny() {
  const sid = getSupportSessionId();
  if (!sid) return;
  setSupportSessionId(null);
  try {
    await supabase.rpc("end_support_session", { _session_id: sid });
  } catch (e) {
    console.warn("[auth] end_support_session failed", e);
  }
}

async function startSupportSession(clubId: string) {
  try {
    const { data, error } = await supabase.rpc("start_support_session", {
      _club_id: clubId,
    });
    if (error) {
      console.warn("[auth] start_support_session failed", error);
      return;
    }
    if (typeof data === "string") setSupportSessionId(data);
  } catch (e) {
    console.warn("[auth] start_support_session threw", e);
  }
}

/**
 * Switch the active club. For Creators this opens "Support Mode" on the target
 * club; closes any prior support session first.
 */
export async function setActiveClub(clubId: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  const prev = getActiveClubId();
  if (prev && prev !== clubId) {
    await endSupportSessionIfAny();
  }
  if (clubId) localStorage.setItem(ACTIVE_CLUB_KEY, clubId);
  else {
    localStorage.removeItem(ACTIVE_CLUB_KEY);
    await endSupportSessionIfAny();
  }

  // Open a support session if the current user is a Creator entering a club.
  if (clubId && cached?.isCreator) {
    await startSupportSession(clubId);
  }

  await refreshAuthFromSession();
}

async function buildAuth(userId: string): Promise<Auth | null> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role,club_id").eq("user_id", userId),
  ]);

  if (!roles || roles.length === 0) return null;

  const isCreator = roles.some((r) => r.role === "creator");

  // Creators see every club in the system; regular users see only the clubs
  // they are members of (via user_roles.club_id).
  const memberClubIds = roles.map((r) => r.club_id).filter((id): id is string => !!id);
  let allClubs: { id: string; name: string }[] = [];
  if (isCreator) {
    const { data } = await supabase.from("clubs").select("id,name").order("name");
    allClubs = data ?? [];
  } else if (memberClubIds.length > 0) {
    const { data } = await supabase
      .from("clubs")
      .select("id,name")
      .in("id", memberClubIds)
      .order("name");
    allClubs = data ?? [];
  }

  const clubs: ClubInfo[] = allClubs.map((c) => {
    const r = roles.find((x) => x.club_id === c.id)?.role as AppRole | undefined;
    // Creators are not members; they are shown as Owner-equivalent ("Support") in their club list.
    return { id: c.id, name: c.name, role: r ?? "owner" };
  });

  let activeClubId = getActiveClubId();
  if (activeClubId && !clubs.some((c) => c.id === activeClubId)) activeClubId = null;
  // Auto-pick only when there is exactly one club AND the user is a regular
  // member. Users with several memberships must choose explicitly.
  if (!activeClubId && !isCreator && clubs.length === 1) {
    activeClubId = clubs[0].id;
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_CLUB_KEY, activeClubId);
  }
  const activeClub = clubs.find((c) => c.id === activeClubId) ?? null;

  // Support mode = a Creator currently has an active club open.
  const supportMode = isCreator && !!activeClub;
  const appRole: AppRole = supportMode
    ? "owner"
    : (activeClub?.role ?? (isCreator ? "creator" : (roles[0].role as AppRole)));

  return {
    userId,
    appRole,
    isCreator,
    supportMode,
    role: legacyRoleFor(appRole),
    name: profile?.display_name || "Без имени",
    activeClubId: activeClub?.id ?? null,
    activeClubName: activeClub?.name ?? null,
    clubs,
  };
}

async function refreshAuthFromSession() {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      const had = cached !== null;
      cached = null;
      writeSnapshot(null);
      if (had && typeof window !== "undefined") {
        const path = window.location.pathname;
        if (path !== "/login" && path !== "/" && path !== "/no-access") {
          window.location.replace("/login?expired=1");
          return;
        }
      }
      return;
    }
    const next = await buildAuth(userId);
    cached = next;
    writeSnapshot(next);
  } catch (e) {
    console.error("[auth] refresh failed", e);
  } finally {
    initializing = false;
    notify();
  }
}

export async function signUp(opts: {
  email: string;
  password: string;
  displayName: string;
  clubName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await supabase.auth.signUp({
    email: opts.email,
    password: opts.password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        display_name: opts.displayName,
        club_name: opts.clubName,
      },
    },
  });
  if (error) return { ok: false, error: error.message };
  await refreshAuthFromSession();
  bumpActivity();
  return { ok: true };
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  await refreshAuthFromSession();
  bumpActivity();
  return { ok: true };
}

function clearLocalAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
    localStorage.removeItem(ACTIVE_CLUB_KEY);
    localStorage.removeItem(SUPPORT_SESSION_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("poker-") && k !== "poker-data-v1") {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {
    console.warn("[auth] failed to clear local storage", e);
  }
}

export async function logout() {
  await endSupportSessionIfAny();
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn("[auth] signOut error", e);
  }
  cached = null;
  clearLocalAuthStorage();
  notify();
}

// 12-hour idle auto-logout
function bumpActivity() {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

function checkIdle() {
  if (typeof window === "undefined") return;
  const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) ?? 0);
  if (last && Date.now() - last > IDLE_LIMIT_MS && cached) {
    void logout().then(() => {
      if (typeof window !== "undefined" && location.pathname !== "/login") {
        window.location.replace("/login?expired=1");
      }
    });
  }
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      const had = cached !== null;
      cached = null;
      clearLocalAuthStorage();
      initializing = false;
      notify();
      if (had && location.pathname !== "/login") {
        window.location.replace("/login");
      }
      return;
    }
    void refreshAuthFromSession();
  });
  void refreshAuthFromSession();

  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((evt) =>
    window.addEventListener(evt, bumpActivity, { passive: true }),
  );
  bumpActivity();
  setInterval(checkIdle, 60_000);
  checkIdle();
}

export function useAuth(): Auth | null {
  const [a, setA] = useState<Auth | null>(cached);
  useEffect(() => {
    const l = () => setA(cached);
    listeners.add(l);
    setA(cached);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return a;
}

export function useAuthState(): { auth: Auth | null; initializing: boolean } {
  const [state, setState] = useState({ auth: cached, initializing });
  useEffect(() => {
    const l = () => setState({ auth: cached, initializing });
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}

export function useStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = subscribe(() => setTick((t) => t + 1));
    return () => {
      unsub();
    };
  }, []);
  return store.getAll();
}
