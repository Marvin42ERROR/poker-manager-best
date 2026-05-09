import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { store, subscribe } from "./poker-store";

export type AppRole = "creator" | "owner" | "pitboss" | "dealer" | "player";
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
  isCreator: boolean;
  activeClubId: string | null;
  activeClubName: string | null;
  clubs: ClubInfo[];
}

const SNAPSHOT_KEY = "poker-auth-snapshot-v2";
const ACTIVE_CLUB_KEY = "poker-active-club-v2";
const LAST_ACTIVITY_KEY = "poker-last-activity-v2";
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000; // 12 hours

let cached: Auth | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function legacyRoleFor(role: AppRole): Role {
  return role === "creator" || role === "owner" || role === "pitboss" ? "admin" : "player";
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

export function getActiveClubId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_CLUB_KEY);
}

export function setActiveClub(clubId: string | null) {
  if (typeof window === "undefined") return;
  if (clubId) localStorage.setItem(ACTIVE_CLUB_KEY, clubId);
  else localStorage.removeItem(ACTIVE_CLUB_KEY);
  // refresh snapshot to reflect new active club
  void refreshAuthFromSession();
}

async function buildAuth(userId: string): Promise<Auth | null> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role,club_id").eq("user_id", userId),
  ]);

  if (!roles || roles.length === 0) return null;

  const isCreator = roles.some((r) => r.role === "creator");

  // collect club memberships
  const clubIds = roles.map((r) => r.club_id).filter((id): id is string => !!id);
  let allClubs: { id: string; name: string }[] = [];
  if (isCreator) {
    const { data } = await supabase.from("clubs").select("id,name").order("name");
    allClubs = data ?? [];
  } else if (clubIds.length > 0) {
    const { data } = await supabase
      .from("clubs")
      .select("id,name")
      .in("id", clubIds)
      .order("name");
    allClubs = data ?? [];
  }

  const clubs: ClubInfo[] = allClubs.map((c) => {
    const r = roles.find((x) => x.club_id === c.id)?.role as AppRole | undefined;
    return { id: c.id, name: c.name, role: r ?? (isCreator ? "creator" : "owner") };
  });

  let activeClubId = getActiveClubId();
  if (activeClubId && !clubs.some((c) => c.id === activeClubId)) activeClubId = null;
  if (!activeClubId && !isCreator && clubs.length > 0) {
    activeClubId = clubs[0].id;
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_CLUB_KEY, activeClubId);
  }
  const activeClub = clubs.find((c) => c.id === activeClubId) ?? null;

  const appRole: AppRole =
    activeClub?.role ?? (isCreator ? "creator" : (roles[0].role as AppRole));

  return {
    userId,
    appRole,
    isCreator,
    role: legacyRoleFor(appRole),
    name: profile?.display_name || "Без имени",
    activeClubId: activeClub?.id ?? null,
    activeClubName: activeClub?.name ?? null,
    clubs,
  };
}

async function refreshAuthFromSession() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) {
    cached = null;
    writeSnapshot(null);
    notify();
    return;
  }
  const next = await buildAuth(userId);
  cached = next;
  writeSnapshot(next);
  notify();
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

export async function logout() {
  await supabase.auth.signOut();
  cached = null;
  writeSnapshot(null);
  if (typeof window !== "undefined") {
    localStorage.removeItem(ACTIVE_CLUB_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  }
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
  // session listener
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      void refreshAuthFromSession();
    } else {
      cached = null;
      writeSnapshot(null);
      notify();
    }
  });
  // initial bootstrap
  void refreshAuthFromSession();

  // activity tracking
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

// existing data store hook untouched
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
