import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth, getAuth, type AppRole } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Users, RefreshCw, Pencil, Check, X, LogOut, UserMinus } from "lucide-react";
import { canManageActiveClub } from "@/lib/membership";
import {
  listClubMembers,
  changeMemberRole,
  removeMember,
  leaveClub,
  renameMember,
  ROLE_LABEL,
  STATUS_LABEL,
  ASSIGNABLE_ROLES,
  type ClubMember,
} from "@/lib/club-members";

export const Route = createFileRoute("/members")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const a = getAuth();
    if (!a) throw redirect({ to: "/login" });
    if (!a.activeClubId) throw redirect({ to: "/select-club" });
  },
  component: MembersPage,
});

function MembersPage() {
  const auth = useAuth();
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<ClubMember | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const canManage = !!auth && canManageActiveClub({
    isCreator: auth.isCreator,
    appRole: auth.appRole,
  });
  const canGrantOwner = !!auth && (auth.isCreator || auth.appRole === "owner");
  const clubId = auth?.activeClubId ?? null;
  const myUserId = auth?.userId;

  const refresh = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    try {
      setMembers(await listClubMembers(clubId));
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось загрузить участников");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRoleChange = async (m: ClubMember, role: AppRole) => {
    if (role === m.role) return;
    setBusyId(m.id);
    try {
      await changeMemberRole(m.id, role);
      toast.success("Роль обновлена");
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось изменить роль");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async () => {
    if (!confirmRemove) return;
    const m = confirmRemove;
    setBusyId(m.id);
    setConfirmRemove(null);
    try {
      await removeMember(m.id);
      toast.success("Участник удалён");
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось удалить");
    } finally {
      setBusyId(null);
    }
  };

  const handleLeave = async () => {
    if (!clubId) return;
    setConfirmLeave(false);
    setBusyId("leave");
    try {
      await leaveClub(clubId);
      toast.success("Вы вышли из клуба");
      if (typeof window !== "undefined") window.location.replace("/select-club");
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось выйти");
      setBusyId(null);
    }
  };

  const startEdit = (m: ClubMember) => {
    setEditingId(m.id);
    setEditValue(m.display_name);
  };

  const saveEdit = async (m: ClubMember) => {
    const next = editValue.trim();
    if (!next || next === m.display_name) {
      setEditingId(null);
      return;
    }
    setBusyId(m.id);
    try {
      await renameMember(m.id, next);
      toast.success("Имя обновлено");
      setEditingId(null);
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось переименовать");
    } finally {
      setBusyId(null);
    }
  };

  const active = members.filter((m) => m.status === "active");
  const inactive = members.filter((m) => m.status !== "active");
  const myMembership = active.find((m) => m.user_id === myUserId);
  const activeOwners = active.filter((m) => m.role === "owner").length;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="size-6 text-primary" />
              Участники клуба
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {auth?.activeClubName ?? "Клуб"} · всего активных: {active.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {myMembership && !(myMembership.role === "owner" && activeOwners <= 1) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmLeave(true)}
                className="gap-2"
                disabled={busyId === "leave"}
              >
                <LogOut className="size-4" />
                Выйти из клуба
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
              <RefreshCw className="size-4" />
              Обновить
            </Button>
          </div>
        </div>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Активные участники</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground">В клубе пока нет активных участников.</p>
          ) : (
            <ul className="divide-y divide-border/60 -mx-2">
              {active.map((m) => {
                const isSelf = m.user_id === myUserId;
                const isLastOwner = m.role === "owner" && activeOwners <= 1;
                const editable = canManage || isSelf;
                return (
                  <li key={m.id} className="px-2 py-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      {editingId === m.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            maxLength={80}
                            className="max-w-[240px]"
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" onClick={() => saveEdit(m)} disabled={busyId === m.id}>
                            <Check className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {m.display_name || "Без имени"}
                            {isSelf && <span className="text-xs text-muted-foreground ml-2">(вы)</span>}
                          </span>
                          {editable && (
                            <Button size="icon" variant="ghost" onClick={() => startEdit(m)}>
                              <Pencil className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        Вступил: {new Date(m.joined_at).toLocaleDateString("ru-RU")}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {canManage && !isSelf ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => handleRoleChange(m, v as AppRole)}
                          disabled={busyId === m.id || isLastOwner}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.filter((r) => !r.ownerOnly || canGrantOwner).map((r) => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
                      )}

                      {canManage && !isSelf && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setConfirmRemove(m)}
                          disabled={busyId === m.id || isLastOwner}
                          title={isLastOwner ? "Нельзя удалить последнего владельца" : "Удалить из клуба"}
                        >
                          <UserMinus className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {inactive.length > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold mb-4 text-muted-foreground">История участия</h2>
            <ul className="divide-y divide-border/60 -mx-2">
              {inactive.map((m) => (
                <li key={m.id} className="px-2 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{m.display_name || "Без имени"}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {ROLE_LABEL[m.role]} · {STATUS_LABEL[m.status]}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {m.left_at ? new Date(m.left_at).toLocaleDateString("ru-RU") : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить участника?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.display_name || "Участник"} потеряет доступ к клубу. История сохранится.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из клуба?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы потеряете доступ к клубу «{auth?.activeClubName}». Позже можно подать новую заявку.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave}>Выйти</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
