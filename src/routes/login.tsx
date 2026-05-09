import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { signIn, signUp, getAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PokerLogo } from "@/components/PokerLogo";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";

type SearchParams = { expired?: string };

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    expired: typeof s.expired === "string" ? s.expired : undefined,
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined" && getAuth()) {
      throw redirect({ to: "/games" });
    }
  },
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clubName, setClubName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "signin") {
        const r = await signIn(email.trim(), pwd);
        if (!r.ok) {
          setErr(r.error);
          return;
        }
      } else {
        if (!displayName.trim()) {
          setErr("Укажите ваше имя");
          return;
        }
        const r = await signUp({
          email: email.trim(),
          password: pwd,
          displayName: displayName.trim(),
          clubName: clubName.trim(),
        });
        if (!r.ok) {
          setErr(r.error);
          return;
        }
      }
      const a = getAuth();
      if (a?.isCreator && !a.activeClubId) {
        navigate({ to: "/select-club" });
      } else {
        navigate({ to: "/games" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 bg-card/80 backdrop-blur border-border/60">
        <div className="flex flex-col items-center mb-6">
          <h1 className="font-fancy text-5xl leading-none mb-2 font-serif font-extrabold text-black text-center">
            Poker Manager
          </h1>
          <PokerLogo size={88} />
          <p className="text-sm text-muted-foreground mt-3 tracking-wide uppercase">
            Private Club Access
          </p>
        </div>

        {/* Безопасность: предупреждение про автозаполнение */}
        <div
          role="alert"
          className="mb-5 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
        >
          <ShieldAlert className="size-4 shrink-0 mt-0.5" />
          <p>
            <strong>Не включайте автоматическое запоминание логина и пароля</strong> в
            браузере — для финансовой и личной безопасности клуба.
          </p>
        </div>

        {search.expired === "1" && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Сеанс истёк после 12 часов неактивности. Войдите снова.
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 rounded-md border border-border/60 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded py-1.5 transition-colors ${
              mode === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded py-1.5 transition-colors ${
              mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Создать клуб
          </button>
        </div>

        <form
          onSubmit={submit}
          className="space-y-3"
          noValidate
          autoComplete="off"
          spellCheck={false}
        >
          {mode === "signup" && (
            <>
              <Input
                type="text"
                placeholder="Ваше имя (владелец)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="off"
                className="h-11"
              />
              <Input
                type="text"
                placeholder="Название клуба"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                autoComplete="off"
                className="h-11"
              />
            </>
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            autoComplete="off"
            name="poker-email"
            className="h-11"
          />
          <div className="relative">
            <Input
              type={showPwd ? "text" : "password"}
              placeholder="Password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="new-password"
              name="poker-password"
              className="h-11 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? "Скрыть пароль" : "Показать пароль"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showPwd ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>

          {err && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {err}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "..." : mode === "signin" ? "Войти" : "Создать клуб и войти"}
          </Button>
        </form>

        <p className="mt-6 pt-4 border-t border-border/60 text-center text-xs text-muted-foreground">
          Бесплатная DEMO-версия. В будущем появится подписка с оплатой криптой.
        </p>
      </Card>
    </div>
  );
}
