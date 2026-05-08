import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, useStore, getAuth } from "@/lib/auth";
import { store } from "@/lib/poker-store";
import { AppShell, AccessDenied } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

export const Route = createFileRoute("/players")({
  component: PlayersPage,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const a = getAuth();
    if (!a) throw redirect({ to: "/login" });
    if (a.role !== "admin") throw redirect({ to: "/games" });
  },
});

function fmt(n?: number) {
  if (n == null) return "—";
  return n.toLocaleString("ru-RU") + " ₽";
}

function PlayersPage() {
  const auth = useAuth();
  const data = useStore();
  const [selected, setSelected] = useState<string | null>(data.players[0]?.id || null);

  if (!auth) return null;
  if (auth.role !== "admin") return <AppShell><AccessDenied /></AppShell>;

  const player = data.players.find((p) => p.id === selected);
  const history = data.sessions.filter((s) => s.playerId === selected);
  const totalPL = history.reduce((acc, s) => acc + (s.cashOut != null ? s.cashOut - s.buyIn : 0), 0);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Досье игроков</h1>
        <p className="text-muted-foreground mt-1">История, заметки и теги</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="p-3 bg-card/70 border-border/60 h-fit">
          {data.players.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`w-full text-left px-3 py-2.5 rounded-md flex items-center gap-2 transition-colors ${
                selected === p.id ? "bg-primary/15 text-foreground" : "hover:bg-accent text-muted-foreground"
              }`}
            >
              <User className="size-4" />
              <span className="truncate text-sm">{p.name}</span>
            </button>
          ))}
        </Card>

        {player && <PlayerDetail key={player.id} player={player} history={history} totalPL={totalPL} />}
      </div>
    </AppShell>
  );
}

function PlayerDetail({ player, history, totalPL }: any) {
  const [tag, setTag] = useState(player.tag);
  const [notes, setNotes] = useState(player.notes);
  const [saved, setSaved] = useState(false);

  const save = () => {
    store.updatePlayerNotes(player.id, notes, tag);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/70 border-border/60">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{player.name}</h2>
            <Badge className="mt-2 bg-primary/20 text-primary border-primary/30">{tag || "Без тега"}</Badge>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Суммарный P/L</div>
            <div className={`text-2xl font-bold ${totalPL >= 0 ? "text-success" : "text-destructive"}`}>
              {totalPL >= 0 ? "+" : ""}{fmt(totalPL)}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card/70 border-border/60">
        <h3 className="font-semibold mb-3">Приватные заметки</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Тег / Пометка</label>
            <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Кэшбек, Должен 5000 …" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Заметки (стиль игры, договоренности)</label>
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save}>Сохранить</Button>
            {saved && <span className="text-sm text-success">Сохранено ✓</span>}
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card/70 border-border/60">
        <h3 className="font-semibold mb-3">История игр</h3>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">Нет сыгранных сессий.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border/60">
                <th className="py-2 font-medium">Дата</th>
                <th className="py-2 font-medium">Стол</th>
                <th className="py-2 font-medium">Бай-ин</th>
                <th className="py-2 font-medium">Кэш-аут</th>
                <th className="py-2 font-medium">P/L</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s: any) => {
                const pl = s.cashOut != null ? s.cashOut - s.buyIn : null;
                return (
                  <tr key={s.id} className="border-b border-border/30 last:border-0">
                    <td className="py-2.5">{s.date}</td>
                    <td className="py-2.5 text-muted-foreground">{s.tableName}</td>
                    <td className="py-2.5">{fmt(s.buyIn)}</td>
                    <td className="py-2.5">{fmt(s.cashOut)}</td>
                    <td className={`py-2.5 font-medium ${pl == null ? "" : pl >= 0 ? "text-success" : "text-destructive"}`}>
                      {pl == null ? "—" : (pl >= 0 ? "+" : "") + fmt(pl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
