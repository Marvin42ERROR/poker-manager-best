import { redirect } from "@tanstack/react-router";
import { getAuth } from "./auth";

/**
 * Centralized route guards. All beforeLoad checks for protected routes
 * should go through these helpers — never inline duplicate logic.
 *
 * Guards run synchronously against the cached auth snapshot (hydrated from
 * localStorage). The session is then re-validated asynchronously against
 * Supabase via refreshAuthFromSession() — if the snapshot is stale, that
 * refresh will force-redirect to /login.
 */

export function requireAuth() {
  if (typeof window === "undefined") return;
  if (!getAuth()) {
    throw redirect({ to: "/login" });
  }
}

export function requireAdmin() {
  if (typeof window === "undefined") return;
  const a = getAuth();
  if (!a) throw redirect({ to: "/login" });
  if (a.role !== "admin") throw redirect({ to: "/no-access" });
}

export function redirectIfAuthed() {
  if (typeof window === "undefined") return;
  if (getAuth()) {
    throw redirect({ to: "/games" });
  }
}
