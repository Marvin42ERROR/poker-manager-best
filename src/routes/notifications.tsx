import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, getAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Inbox, ShieldCheck, RefreshCw } from "lucide-react";
import {
  approveMembershipRequest,
  canManageActiveClub,
  getClubSettings,
  listPendingRequestsForMe,
  rejectMembershipRequest,
  updateClubVisibility,
  type AppRole,
  type ClubSettings,
  type PendingRequest,
} from "@/lib/membership";

export const Route = createFileRoute("/notifications")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const a = getAuth();
    if (!a) throw redirect({ to: "/login" });
    if (!canManageActiveClub({ isCreator: a.isCreator, appRole: a.appRole })) {
      throw redirect({ to: "/games" });
    }
  },
  component: NotificationsPage,
});

const ASSIGNABLE_ROLES: { value: AppRole; label: string; ownerOnly?: boolean }[] = [
  { value: "player", label: "Игрок" },
  { value: "dealer", label: "Дилер" },
  { value: "manager", label: "Менеджер" },
  { value: "co_owner", label: "Со-владелец", ownerOnly: true },
  { value: "owner", label: "Владелец", ownerOnly: true },
];

function NotificationsPage() {
  const auth = useAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ClubSettings | null>(null);
  const [roleByRequest, setRoleByRequest] = useState<Record<string, AppRole>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const canGrantOwner =
    !!auth && (auth.isCreator || auth.appRole === "owner");

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listPendingRequestsForMe();
      setRequests(list);
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  };

  const refreshSettings = async () => {
    if (!auth?.activeClubId) {
      setSettings(null);
      return;
    }
    try {
      setSettings(await getClubSettings(auth.activeClubId));
    } catch {
      setSettings(null);
    }
  };

  useEffect(() => {
    refresh();
    refreshSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.activeClubId]);

  const handleApprove = async (id: string) => {
    const role = roleByRequest[id] ?? "player";
    setBusyId(id);
    try {
      await approveMembershipRequest(id, role);
      toast.success("Заявка одобрена");
      // TODO(audit): запись уже сделана в audit_log через RPC.
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось одобрить");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    try {
      await rejectMembershipRequest(id);
      toast.success("Заявка отклонена");
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось отклонить");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleVisibility = async (next: boolean) => {
    if (!settings) return;
    try {
      await updateClubVisibility(settings.club_id, next);
      setSettings({ ...settings, is_public: next });
      toast.success(next ? "Клуб открыт для поиска" : "Клуб скрыт из поиска");
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось обновить");
    }
  };

  const copyInvite = async () => {
    if (!settings?.invite_code) return;
    await navigator.clipboard.writeText(settings.invite_code);
    toast.success("Код приглашения скопирован");
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Inbox className="size-6 text-primary" />
              Уведомления
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Заявки на вступление в клуб
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
            <RefreshCw className="size-4" />
            Обновить
          </Button>
        </div>

        {settings && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <h2 className="font-semibold">Настройки доступа клуба</h2>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Публичный клуб</div>
                <div className="text-xs text-muted-foreground">
                  Виден в поиске. Пользователи могут отправлять заявки без кода.
                </div>
              </div>
              <Switch
                checked={settings.is_public}
                onCheckedChange={handleToggleVisibility}
              />
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Код приглашения</div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={settings.invite_code}
                  className="font-mono tracking-wider max-w-[200px]"
                />
                <Button variant="outline" size="sm" onClick={copyInvite} className="gap-2">
                  <Copy className="size-4" />
                  Копировать
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Передайте этот код, чтобы дать доступ к приватному клубу.
              </p>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Ожидающие заявки</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет новых заявок.</p>
          ) : (
            <ul className="divide-y divide-border/60 -mx-2">
              {requests.map((r) => {
                const selected = roleByRequest[r.id] ?? "player";
                return (
                  <li key={r.id} className="px-2 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {r.display_name || "Без имени"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Клуб: <span className="font-medium">{r.club_name}</span>
                          {" · "}
                          {new Date(r.created_at).toLocaleString("ru-RU")}
                        </div>
                        {r.message && (
                          <div className="text-sm mt-2 p-2 bg-muted/40 rounded">
                            «{r.message}»
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary">pending</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={selected}
                        onValueChange={(v) =>
                          setRoleByRequest((m) => ({ ...m, [r.id]: v as AppRole }))
                        }
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.filter(
                            (opt) => !opt.ownerOnly || canGrantOwner,
                          ).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => handleApprove(r.id)}
                      >
                        Одобрить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => handleReject(r.id)}
                      >
                        Отклонить
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
