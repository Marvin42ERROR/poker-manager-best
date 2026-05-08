import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, useStore } from "@/lib/auth";
import { getAuth } from "@/lib/auth";
import { store, type Session } from "@/lib/poker-store";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Users, Clock } from "lucide-react";

export const Route = createFileRoute("/games")({
  component: GamesPage,
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getAuth()) {
      throw redirect({ to: "/login" });
    }
  },
});

function fmtMoney(n?: number) {
  if (n == null) return "—";
  return n.toLocaleString("ru-RU") + " ₽";
}

function GamesPage() {
  const auth = useAuth();
  const data = useStore();
  const [editing, setEditing] = useState<Session | null>(null);

  if (!auth) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = data.sessions.filter((s) => s.date === today);
  const tables = data.tables.filter((t) => todaySessions.some((s) => s.tableId === t.id));

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Игры (Столы)</h1>
        <p className="text-muted-foreground mt-1">Текущие сессии · {today}</p>
      </div>

      <div className="grid gap-6">
        {tables.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Сегодня сессий пока нет.</Card>
        )}
        {tables.map((t) => {
          const list = todaySessions.filter((s) => s.tableId === t.id);
          const playing = list.filter((s) => s.status === "playing").length;
          return (
            <Card key={t.id} className="p-6 bg-card/70 border-border/60">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{t.name}</h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1"><Users className="size-3.5" /> {playing} в игре</span>
                    <span>·</span>
                    <span>Рейк: {fmtMoney(t.rakePerHour)}/час</span>
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border/60">
                      <th className="py-2 pr-4 font-medium">Игрок</th>
                      <th className="py-2 pr-4 font-medium">Вход</th>
                      <th className="py-2 pr-4 font-medium">Выход</th>
                      <th className="py-2 pr-4 font-medium">Бай-ин</th>
                      <th className="py-2 pr-4 font-medium">На выходе</th>
                      <th className="py-2 pr-4 font-medium">P/L</th>
                      <th className="py-2 pr-4 font-medium">Статус</th>
                      {auth.role === "admin" && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => {
                      const pl = s.cashOut != null ? s.cashOut - s.buyIn : null;
                      return (
                        <tr key={s.id} className="border-b border-border/30 last:border-0">
                          <td className="py-3 pr-4 font-medium">{s.playerName}</td>
                          <td className="py-3 pr-4 text-muted-foreground"><Clock className="inline size-3 mr-1" />{s.joinTime}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{s.leaveTime || "—"}</td>
                          <td className="py-3 pr-4">{fmtMoney(s.buyIn)}</td>
                          <td className="py-3 pr-4">{fmtMoney(s.cashOut)}</td>
                          <td className={`py-3 pr-4 font-medium ${pl == null ? "" : pl >= 0 ? "text-success" : "text-destructive"}`}>
                            {pl == null ? "—" : (pl >= 0 ? "+" : "") + fmtMoney(pl)}
                          </td>
                          <td className="py-3 pr-4">
                            {s.status === "playing" ? (
                              <Badge className="bg-success text-success-foreground">В игре</Badge>
                            ) : (
                              <Badge variant="secondary">Выбыл</Badge>
                            )}
                          </td>
                          {auth.role === "admin" && (
                            <td className="py-3 text-right">
                              <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                                <Pencil className="size-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>

      <EditSessionDialog session={editing} onClose={() => setEditing(null)} />
    </AppShell>
  );
}

function EditSessionDialog({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const [buyIn, setBuyIn] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [leaveTime, setLeaveTime] = useState("");
  const [status, setStatus] = useState<"playing" | "out">("playing");

  // sync when session changes
  if (session && buyIn === "" && cashOut === "" && leaveTime === "") {
    // initial-only
  }

  const open = !!session;
  const init = (s: Session) => {
    setBuyIn(String(s.buyIn));
    setCashOut(s.cashOut != null ? String(s.cashOut) : "");
    setLeaveTime(s.leaveTime || "");
    setStatus(s.status);
  };

  // Re-init when session id changes
  const sid = session?.id;
  useReinit(sid, () => session && init(session));

  if (!session) return null;

  const save = () => {
    const co = cashOut.trim() === "" ? undefined : Number(cashOut);
    store.updateSession(session.id, {
      buyIn: Number(buyIn),
      cashOut: co,
      leaveTime: leaveTime || undefined,
      status: co != null || leaveTime ? "out" : status,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать сессию · {session.playerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Бай-ин</Label>
            <Input type="number" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} />
          </div>
          <div>
            <Label>Сумма на выходе</Label>
            <Input type="number" value={cashOut} onChange={(e) => setCashOut(e.target.value)} placeholder="—" />
          </div>
          <div>
            <Label>Время выхода</Label>
            <Input value={leaveTime} onChange={(e) => setLeaveTime(e.target.value)} placeholder="HH:MM" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect } from "react";
function useReinit(key: string | undefined, fn: () => void) {
  useEffect(() => {
    if (key) fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
