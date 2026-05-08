import { useEffect, useState, useSyncExternalStore } from "react";
import { store, subscribe } from "./poker-store";

export type Role = "admin" | "player";

const AUTH_KEY = "poker-auth";

interface Auth {
  role: Role;
  name: string;
}

const authListeners = new Set<() => void>();
function notifyAuth() {
  authListeners.forEach((l) => l());
}

export function login(username: string, password: string): Auth | null {
  if (password !== "123") return null;
  let auth: Auth | null = null;
  if (username === "admin") auth = { role: "admin", name: "Владелец клуба" };
  else if (username === "player") auth = { role: "player", name: "Игрок (Демо)" };
  if (auth && typeof window !== "undefined") {
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    notifyAuth();
  }
  return auth;
}

export function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_KEY);
    notifyAuth();
  }
}

export function getAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useAuth(): Auth | null {
  const [auth, setAuth] = useState<Auth | null>(null);
  useEffect(() => {
    setAuth(getAuth());
    const l = () => setAuth(getAuth());
    authListeners.add(l);
    return () => {
      authListeners.delete(l);
    };
  }, []);
  return auth;
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
