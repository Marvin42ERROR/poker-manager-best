import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { login, getAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PokerLogo } from "@/components/PokerLogo";
import { Eye, EyeOff } from "lucide-react";

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
  const [errFields, setErrFields] = useState<{ u: boolean; p: boolean }>({ u: false, p: false });
  const navigate = Route.useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const login_ = u.trim();
    if (!login_ && !p) {
      setErr("Введите логин и пароль");
      setErrFields({ u: true, p: true });
      return;
    }
    if (!login_) {
      setErr("Введите логин");
      setErrFields({ u: true, p: false });
      return;
    }
    if (!p) {
      setErr("Введите пароль");
      setErrFields({ u: false, p: true });
      return;
    }
    const known = login_ === "admin" || login_ === "player";
    if (!known) {
      setErr(`Пользователь «${login_}» не найден. Используйте admin или player.`);
      setErrFields({ u: true, p: false });
      return;
    }
    const a = login(login_, p);
    if (!a) {
      setErr("Неверный пароль для этого пользователя");
      setErrFields({ u: false, p: true });
      return;
    }
    setErr("");
    setErrFields({ u: false, p: false });
    navigate({ to: "/games" });
  };

  const errCls = "border-destructive ring-1 ring-destructive/60 bg-destructive/5";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 bg-card/80 backdrop-blur border-border/60">
        <div className="flex flex-col items-center mb-6">
          <h1 className="font-fancy text-6xl leading-none mb-2 font-serif font-extrabold my-0 mx-0 px-0 py-0 border-0 text-black text-center">Poker Manager</h1>
          <PokerLogo size={104} />
          <p className="text-sm text-muted-foreground mt-3 tracking-wide uppercase">
            Private Club Access
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <Input
              id="u"
              type="text"
              value={u}
              onChange={(e) => {
                setU(e.target.value);
                if (errFields.u) setErrFields((f) => ({ ...f, u: false }));
              }}
              placeholder="Login"
              autoFocus
              aria-invalid={errFields.u}
              className={`h-12 text-xl text-left px-[12px] py-[8px] placeholder:text-muted-foreground/60 transition-colors ${
                errFields.u ? errCls : "opacity-75 border-double"
              }`}
            />
          </div>
          <div>
            <Label htmlFor="p">Пароль</Label>
            <Input
              id="p"
              type="password"
              value={p}
              onChange={(e) => {
                setP(e.target.value);
                if (errFields.p) setErrFields((f) => ({ ...f, p: false }));
              }}
              aria-invalid={errFields.p}
              className={`transition-colors ${errFields.p ? errCls : ""}`}
            />
          </div>
          {err && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {err}
            </div>
          )}
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
