import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface PendingRequest {
  id: string;
  club_id: string;
  club_name: string;
  user_id: string;
  display_name: string;
  message: string | null;
  created_at: string;
}

export interface ClubLookupResult {
  id: string;
  name: string;
  is_public: boolean;
}

export async function searchPublicClubs(q: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc("search_public_clubs", { _q: q });
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

export async function findClubByInvite(code: string): Promise<ClubLookupResult | null> {
  const { data, error } = await supabase.rpc("find_club_by_invite", { _code: code });
  if (error) throw error;
  const row = (data ?? [])[0] as ClubLookupResult | undefined;
  return row ?? null;
}

export async function requestClubAccess(opts: {
  clubId: string;
  inviteCode?: string | null;
  message?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("request_club_access", {
    _club_id: opts.clubId,
    _invite_code: opts.inviteCode ?? null,
    _message: opts.message ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function approveMembershipRequest(requestId: string, role: AppRole): Promise<void> {
  const { error } = await supabase.rpc("approve_membership_request", {
    _request_id: requestId,
    _role: role,
  });
  if (error) throw error;
}

export async function rejectMembershipRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("reject_membership_request", {
    _request_id: requestId,
  });
  if (error) throw error;
}

export async function cancelMembershipRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_membership_request", {
    _request_id: requestId,
  });
  if (error) throw error;
}

export async function countPendingRequestsForMe(): Promise<number> {
  const { data, error } = await supabase.rpc("count_pending_requests_for_me");
  if (error) throw error;
  return (data ?? 0) as number;
}

export async function listPendingRequestsForMe(): Promise<PendingRequest[]> {
  const { data, error } = await supabase.rpc("list_pending_requests_for_me");
  if (error) throw error;
  return (data ?? []) as PendingRequest[];
}

export interface MyRequest {
  id: string;
  club_id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  assigned_role: AppRole | null;
  created_at: string;
  club_name?: string;
}

export async function listMyRequests(userId: string): Promise<MyRequest[]> {
  const { data, error } = await supabase
    .from("membership_requests")
    .select("id, club_id, status, assigned_role, created_at, clubs(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    club_id: r.club_id,
    status: r.status,
    assigned_role: r.assigned_role,
    created_at: r.created_at,
    club_name: r.clubs?.name,
  }));
}

export interface ClubSettings {
  club_id: string;
  is_public: boolean;
  invite_code: string;
}

export async function getClubSettings(clubId: string): Promise<ClubSettings | null> {
  const { data, error } = await supabase
    .from("club_settings")
    .select("club_id, is_public, invite_code")
    .eq("club_id", clubId)
    .maybeSingle();
  if (error) throw error;
  return data as ClubSettings | null;
}

export async function updateClubVisibility(clubId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase
    .from("club_settings")
    .update({ is_public: isPublic })
    .eq("club_id", clubId);
  if (error) throw error;
}

/** True for Creator / Owner / Co-Owner of the currently-active club. */
export function canManageActiveClub(opts: {
  isCreator: boolean;
  appRole: AppRole;
}): boolean {
  if (opts.isCreator) return true;
  return opts.appRole === "owner" || opts.appRole === "co_owner";
}
