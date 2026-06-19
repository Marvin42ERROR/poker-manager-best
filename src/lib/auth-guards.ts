import { redirect } from "@tanstack/react-router";
import { getAuth, type Auth } from "./auth";

/**
 * Centralized route guards. All beforeLoad checks for protected routes MUST
 * go through these helpers — never inline duplicate logic.
 */

/** Where this user should land after login / when blocked from a forbidden page. */
export function startRouteFor(a: Auth): "/select-club" | "/games" {
  // Creator must always pick a club to enter (Support Mode).
  if (a.isCreator && !a.activeClubId) return "/select-club";
  // Users with no clubs land on /select-club so they can request access.
  if (!a.isCreator && a.clubs.length === 0) return "/select-club";
  // Regular users with multiple memberships choose which club to enter.
  if (!a.isCreator && !a.activeClubId && a.clubs.length > 1) return "/select-club";
  return "/games";
}


export function requireAuth() {
  if (typeof window === "undefined") return;
  const a = getAuth();
  if (!a) throw redirect({ to: "/login" });
  // Force club selection if a club is required but not chosen yet.
  const target = startRouteFor(a);
  if (target === "/select-club") throw redirect({ to: "/select-club" });
}

export function requireAdmin() {
  if (typeof window === "undefined") return;
  const a = getAuth();
  if (!a) throw redirect({ to: "/login" });
  if (a.role !== "admin") throw redirect({ to: "/no-access" });
}

/** Creator-only platform pages (global club management, system tools). */
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
