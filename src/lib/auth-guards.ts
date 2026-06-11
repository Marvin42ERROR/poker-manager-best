import { redirect } from "@tanstack/react-router";
import { getAuth, type Auth } from "./auth";

/**
 * Centralized route guards. All beforeLoad checks for protected routes
 * MUST go through these helpers — never inline duplicate logic.
 *
 * Guards run synchronously against the cached auth snapshot (hydrated from
 * localStorage). The session is then re-validated asynchronously against
 * Supabase via refreshAuthFromSession() — if the snapshot is stale, that
 * refresh will force-redirect to /login.
 */

/** Where this user should land after login / when blocked from a forbidden page. */
export function startRouteFor(a: Auth): "/select-club" | "/games" {
  // Creators with no active club must pick one first.
  if (a.isCreator && !a.activeClubId) return "/select-club";
  return "/games";
}

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

/** Creator-only pages (e.g. /select-club, global club management). */
export function requireCreator() {
  if (typeof window === "undefined") return;
  const a = getAuth();
  if (!a) throw redirect({ to: "/login" });
  if (!a.isCreator) throw redirect({ to: startRouteFor(a) });
}

export function redirectIfAuthed() {
  if (typeof window === "undefined") return;
  const a = getAuth();
  if (a) throw redirect({ to: startRouteFor(a) });
}
