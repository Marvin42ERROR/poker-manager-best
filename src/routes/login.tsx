import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { login, getAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Spade } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  beforeLoad: () => {
    if (typeof window !== "undefined" && getAuth()) {
      throw redirect({ to: "/games" });
    }
  },
});

function LoginPage() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const navigate = Route.useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = login(u.trim(), p);
    if (!a) return setErr("Неверный логин или пароль");
    navigate({ to: "/games" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 bg-card/80 backdrop-blur border-border/60">
        <div className="flex flex-col items-center mb-6">
          <div className="size-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Spade className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Покерный Менеджер</h1>
          <p className="text-sm text-muted-foreground mt-1">Вход в закрытый клуб</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="u">Логин</Label>
            <Input id="u" value={u} onChange={(e) => setU(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="p">Пароль</Label>
            <Input id="p" type="password" value={p} onChange={(e) => setP(e.target.value)} />
          </div>
          {err && <p className="text-destructive text-sm">{err}</p>}
          <Button type="submit" className="w-full">Войти</Button>
        </form>
        <div className="mt-6 pt-6 border-t border-border/60 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Демо-доступы:</p>
          <p>Админ: <span className="text-primary">admin / 123</span></p>
          <p>Игрок: <span className="text-primary">player / 123</span></p>
        </div>
      </Card>
    </div>
  );
}
