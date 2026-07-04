import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/auth";

export type MemberStatus = "active" | "left" | "removed" | "banned";

export interface ClubMember {
  id: string;
  user_id: string;
  display_name: string;
  role: AppRole;
  status: MemberStatus;
  joined_at: string;
  left_at: string | null;
}

export async function listClubMembers(clubId: string): Promise<ClubMember[]> {
  const { data, error } = await supabase.rpc("list_club_members", { _club_id: clubId });
  if (error) throw error;
  return (data ?? []) as ClubMember[];
}

export async function changeMemberRole(memberId: string, role: AppRole): Promise<void> {
  const { error } = await supabase.rpc("change_member_role", {
    _member_id: memberId,
    _role: role,
  });
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_member", { _member_id: memberId });
  if (error) throw error;
}

export async function leaveClub(clubId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_club", { _club_id: clubId });
  if (error) throw error;
}

export async function renameMember(memberId: string, displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Имя не может быть пустым");
  if (trimmed.length > 80) throw new Error("Имя не должно превышать 80 символов");
  const { error } = await supabase.rpc("rename_member", {
    _member_id: memberId,
    _display_name: trimmed,
  });
  if (error) throw error;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  creator: "Создатель",
  owner: "Владелец",
  co_owner: "Со-владелец",
  manager: "Менеджер",
  dealer: "Дилер",
  player: "Игрок",
};

export const STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Активен",
  left: "Вышел",
  removed: "Удалён",
  banned: "Забанен",
};

export const ASSIGNABLE_ROLES: { value: AppRole; label: string; ownerOnly?: boolean }[] = [
  { value: "player", label: "Игрок" },
  { value: "dealer", label: "Дилер" },
  { value: "manager", label: "Менеджер" },
  { value: "co_owner", label: "Со-владелец", ownerOnly: true },
  { value: "owner", label: "Владелец", ownerOnly: true },
];
