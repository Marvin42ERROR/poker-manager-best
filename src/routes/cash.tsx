import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, useStore, getAuth } from "@/lib/auth";
import { AppShell, AccessDenied } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Clock, Wallet, Receipt } from "lucide-react";

export const Route = createFileRoute("/cash")({
  component: CashPage,
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getAuth()) throw redirect({ to: "/login" });
  },
});

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function CashPage() {
  const auth = useAuth();
  const data = useStore();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  if (!auth) return null;
  if (auth.role !== "admin") return <AppShell><AccessDenied /></AppShell>;

  const sessions = data.sessions.filter((s) => s.date === date);
  const expenses = data.expenses.filter((e) => e.date === date);

  // total play time across all sessions in hours
  let totalMinutes = 0;
  const tableHours: Record<string, number> = {};
  sessions.forEach((s) => {
    const start = toMin(s.joinTime);
    const end = s.leaveTime ? toMin(s.leaveTime) : start + 180; // assume +3h if still playing
    const dur = Math.max(0, end - start);
    totalMinutes += dur;
    tableHours[s.tableId] = (tableHours[s.tableId] || 0) + dur / 60;
  });
  const totalHours = totalMinutes / 60;

  // total rake = per table hours * rakePerHour
  let totalRake = 0;
  data.tables.forEach((t) => {
    totalRake += (tableHours[t.id] || 0) * t.rakePerHour;
  });
  totalRake = Math.round(totalRake);

  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
  const net = totalRake - totalExpenses;
  const perHour = totalHours > 0 ? Math.round(totalRake / totalHours) : 0;

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Итоговый кэш</h1>
          <p className="text-muted-foreground mt-1">Доход клуба за вечер</p>
        </div>
        <div>
          <Label className="text-xs">Дата</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Wallet className="size-5" />} label="Общий рейк" value={`${totalRake.toLocaleString("ru-RU")} ₽`} accent />
        <StatCard icon={<Clock className="size-5" />} label="Время игры" value={`${totalHours.toFixed(1)} ч`} />
        <StatCard icon={<TrendingUp className="size-5" />} label="Доходность" value={`${perHour.toLocaleString("ru-RU")} ₽/ч`} />
        <StatCard icon={<Receipt className="size-5" />} label="Расходы" value={`${totalExpenses.toLocaleString("ru-RU")} ₽`} />
      </div>

      <Card className="p-6 bg-card/70 border-border/60">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Чистая прибыль клуба</div>
            <div className={`text-4xl font-bold mt-1 ${net >= 0 ? "text-success" : "text-destructive"}`}>
              {net >= 0 ? "+" : ""}{net.toLocaleString("ru-RU")} ₽
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>Рейк: <span className="text-foreground font-medium">{totalRake.toLocaleString("ru-RU")} ₽</span></div>
            <div>Минус расходы: <span className="text-foreground font-medium">−{totalExpenses.toLocaleString("ru-RU")} ₽</span></div>
          </div>
        </div>
      </Card>

      <Card className="p-6 mt-6 bg-card/70 border-border/60">
        <h3 className="font-semibold mb-3">По столам</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/60">
              <th className="py-2 font-medium">Стол</th>
              <th className="py-2 font-medium">Часов</th>
              <th className="py-2 font-medium">Рейк/час</th>
              <th className="py-2 font-medium text-right">Рейк за вечер</th>
            </tr>
          </thead>
          <tbody>
            {data.tables.map((t) => {
              const h = tableHours[t.id] || 0;
              const rake = Math.round(h * t.rakePerHour);
              return (
                <tr key={t.id} className="border-b border-border/30 last:border-0">
                  <td className="py-2.5">{t.name}</td>
                  <td className="py-2.5">{h.toFixed(1)}</td>
                  <td className="py-2.5">{t.rakePerHour.toLocaleString("ru-RU")} ₽</td>
                  <td className="py-2.5 text-right font-medium">{rake.toLocaleString("ru-RU")} ₽</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <Card className={`p-5 bg-card/70 border-border/60 ${accent ? "ring-1 ring-primary/40" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        {icon}<span className="uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}
