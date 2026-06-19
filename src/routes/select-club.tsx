import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, setActiveClub, logout, type AppRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spade, LogOut, Crown, ShieldCheck, Search, Key, Clock } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  findClubByInvite,
  listMyRequests,
  requestClubAccess,
  searchPublicClubs,
  type MyRequest,
} from "@/lib/membership";

const ROLE_LABEL: Record<AppRole, string> = {
  creator: "Создатель",
  owner: "Владелец",
  co_owner: "Со-владелец",
  manager: "Менеджер",
  dealer: "Дилер",
  player: "Игрок",
};

export const Route = createFileRoute("/select-club")({
  ssr: false,
  component: SelectClubPage,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const a = getAuth();
    if (!a) throw redirect({ to: "/login" });
    if (!a.isCreator && a.clubs.length === 1 && a.activeClubId) {
      throw redirect({ to: "/games" });
    }
  },
});

interface PendingClubChoice {
  id: string;
  name: string;
  needsCode: boolean;
}

function SelectClubPage() {
  const auth = useAuth();
  const navigate = Route.useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);

  const [chosen, setChosen] = useState<PendingClubChoice | null>(null);
  const [reqCode, setReqCode] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);

  useEffect(() => {
    if (!auth?.userId) return;
    listMyRequests(auth.userId).then(setMyRequests).catch(() => {});
  }, [auth?.userId]);

  if (!auth) return null;

  const pick = async (clubId: string) => {
    setBusyId(clubId);
    try {
      await setActiveClub(clubId);
      navigate({ to: "/games" });
    } finally {
      setBusyId(null);
    }
  };

  const doSearch = async () => {
    setSearching(true);
    try {
      setSearchResults(await searchPublicClubs(query.trim()));
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось найти");
    } finally {
      setSearching(false);
    }
  };

  const lookupByCode = async () => {
    if (!code.trim()) return;
    setCodeBusy(true);
    try {
      const club = await findClubByInvite(code.trim());
      if (!club) {
        toast.error("Клуб с таким кодом не найден");
        return;
      }
      setChosen({ id: club.id, name: club.name, needsCode: !club.is_public });
      setReqCode(code.trim());
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setCodeBusy(false);
    }
  };

  const submitRequest = async () => {
    if (!chosen) return;
    setSubmitting(true);
    try {
      await requestClubAccess({
        clubId: chosen.id,
        inviteCode: chosen.needsCode ? reqCode.trim() : null,
        message: reqMessage.trim() || null,
      });
      toast.success("Заявка отправлена. Ожидайте одобрения.");
      setChosen(null);
      setReqCode("");
      setReqMessage("");
      if (auth?.userId) {
        listMyRequests(auth.userId).then(setMyRequests).catch(() => {});
      }
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingMine = myRequests.filter((r) => r.status === "pending");
  const decidedMine = myRequests.filter((r) => r.status !== "pending").slice(0, 5);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl p-8 bg-card/80 backdrop-blur border-border/60">
        <div className="flex flex-col items-center mb-6 text-center">
          <Spade className="size-10 text-primary mb-2" />
          <h1 className="text-2xl font-bold">Выберите клуб</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {auth.isCreator
              ? "Вы вошли как Создатель — у вас доступ ко всем клубам системы."
              : auth.clubs.length === 0
                ? "Вы пока не состоите ни в одном клубе. Найдите клуб или введите код приглашения."
                : "Вы состоите в нескольких клубах. Выберите, в какой войти."}
          </p>
        </div>

        {auth.clubs.length > 0 && (
          <div className="grid gap-2 mb-6">
            {auth.clubs.map((c) => (
              <button
                key={c.id}
                disabled={busyId === c.id}
                onClick={() => pick(c.id)}
                className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {auth.isCreator ? (
                    <Crown className="size-4 text-amber-500 shrink-0" />
                  ) : (
                    <ShieldCheck className="size-4 text-primary shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {auth.isCreator ? "Поддержка (Owner-доступ)" : ROLE_LABEL[c.role]}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-primary shrink-0 ml-3">Открыть →</span>
              </button>
            ))}
          </div>
        )}

        {!auth.isCreator && (
          <>
            <div className="border-t border-border/60 pt-6">
              <h2 className="font-semibold mb-3 text-sm">Присоединиться к другому клубу</h2>
              <Tabs defaultValue="search">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="search" className="gap-2">
                    <Search className="size-4" /> Поиск
                  </TabsTrigger>
                  <TabsTrigger value="code" className="gap-2">
                    <Key className="size-4" /> По коду
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="search" className="space-y-3 pt-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Название публичного клуба"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && doSearch()}
                    />
                    <Button onClick={doSearch} disabled={searching}>
                      Найти
                    </Button>
                  </div>
                  {searchResults.length > 0 && (
                    <ul className="divide-y divide-border/60 border rounded-md">
                      {searchResults.map((r) => (
                        <li
                          key={r.id}
                          className="px-3 py-2 flex items-center justify-between"
                        >
                          <span className="truncate">{r.name}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setChosen({ id: r.id, name: r.name, needsCode: false })
                            }
                          >
                            Запросить доступ
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="code" className="space-y-3 pt-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Код приглашения"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="font-mono tracking-wider"
                      onKeyDown={(e) => e.key === "Enter" && lookupByCode()}
                    />
                    <Button onClick={lookupByCode} disabled={codeBusy || !code.trim()}>
                      Проверить
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Код выдаёт владелец клуба. Работает для публичных и приватных клубов.
                  </p>
                </TabsContent>
              </Tabs>
            </div>

            {(pendingMine.length > 0 || decidedMine.length > 0) && (
              <div className="border-t border-border/60 pt-6 mt-6">
                <h2 className="font-semibold mb-3 text-sm flex items-center gap-2">
                  <Clock className="size-4" /> Мои заявки
                </h2>
                <ul className="space-y-1 text-sm">
                  {pendingMine.map((r) => (
                    <li
                      key={r.id}
                      className="flex justify-between items-center px-3 py-2 rounded bg-muted/30"
                    >
                      <span>{r.club_name ?? "—"}</span>
                      <span className="text-xs text-amber-500">Ожидает</span>
                    </li>
                  ))}
                  {decidedMine.map((r) => (
                    <li
                      key={r.id}
                      className="flex justify-between items-center px-3 py-2 rounded text-muted-foreground"
                    >
                      <span>{r.club_name ?? "—"}</span>
                      <span className="text-xs">
                        {r.status === "approved"
                          ? `Одобрено${r.assigned_role ? " · " + ROLE_LABEL[r.assigned_role] : ""}`
                          : r.status === "rejected"
                            ? "Отклонено"
                            : "Отменено"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await logout();
              navigate({ to: "/login" });
            }}
            className="gap-2"
          >
            <LogOut className="size-4" /> Выйти
          </Button>
        </div>
      </Card>

      <Dialog open={!!chosen} onOpenChange={(o) => !o && setChosen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Запрос доступа</DialogTitle>
            <DialogDescription>
              Клуб: <span className="font-medium">{chosen?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {chosen?.needsCode && (
              <div>
                <label className="text-sm font-medium mb-1 block">Код приглашения</label>
                <Input
                  value={reqCode}
                  onChange={(e) => setReqCode(e.target.value.toUpperCase())}
                  className="font-mono tracking-wider"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Сообщение владельцу (опционально)
              </label>
              <Textarea
                value={reqMessage}
                onChange={(e) => setReqMessage(e.target.value)}
                maxLength={500}
                placeholder="Кратко представьтесь"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChosen(null)}>
              Отмена
            </Button>
            <Button
              onClick={submitRequest}
              disabled={submitting || (chosen?.needsCode && !reqCode.trim())}
            >
              Отправить заявку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
