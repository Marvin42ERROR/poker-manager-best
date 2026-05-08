import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, useStore, getAuth } from "@/lib/auth";
import { store, type Expense } from "@/lib/poker-store";
import { AppShell, AccessDenied } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/expenses")({
  component: ExpensesPage,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const a = getAuth();
    if (!a) throw redirect({ to: "/login" });
    if (a.role !== "admin") throw redirect({ to: "/games" });
  },
});

const CATEGORIES: Expense["category"][] = ["Напитки", "Еда", "Бонусы", "Долги гостей", "Прочее"];

function ExpensesPage() {
  const auth = useAuth();
  const data = useStore();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<Expense["category"]>("Напитки");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");

  if (!auth) return null;
  if (auth.role !== "admin") return <AppShell><AccessDenied /></AppShell>;

  const filtered = data.expenses.filter((e) => e.date === date);
  const total = filtered.reduce((a, e) => a + e.amount, 0);

  const add = () => {
    if (!amount) return;
    store.addExpense({ date, category, amount: Number(amount), comment });
    setAmount("");
    setComment("");
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Затраты клуба</h1>
        <p className="text-muted-foreground mt-1">Расходы на конкретную игру</p>
      </div>

      <Card className="p-6 mb-6 bg-card/70 border-border/60">
        <div className="grid grid-cols-1 md:grid-cols-[160px_180px_140px_1fr_auto] gap-3 items-end">
          <div>
            <Label className="text-xs">Дата</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Категория</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Expense["category"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Сумма ₽</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Комментарий</Label>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="напр.: Виски + кола" />
          </div>
          <Button onClick={add}><Plus className="size-4 mr-1" />Добавить</Button>
        </div>
      </Card>

      <Card className="p-6 bg-card/70 border-border/60">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-3 text-3xl font-serif font-medium text-left text-red-600 mx-0 mb-0 mr-0 my-[20px] py-0 px-0">
            <span>Расходы</span>
            <span className="h-6 w-px bg-zinc-700" />
            <span className="text-3xl font-bold">
              {date.split("-").reverse().join("/")}
            </span>
          </h2>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Итого</div>
            <div className="text-xl font-bold text-primary">{total.toLocaleString("ru-RU")} ₽</div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">Нет расходов за выбранную дату.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border/60">
                <th className="py-2 font-medium">Категория</th>
                <th className="py-2 font-medium">Комментарий</th>
                <th className="py-2 font-medium text-right">Сумма</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-border/30 last:border-0">
                  <td className="py-3">{e.category}</td>
                  <td className="py-3 text-muted-foreground">{e.comment || "—"}</td>
                  <td className="py-3 text-right font-medium">{e.amount.toLocaleString("ru-RU")} ₽</td>
                  <td className="py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => store.deleteExpense(e.id)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AppShell>
  );
}
