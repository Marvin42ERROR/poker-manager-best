import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { useAuth, logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Spade } from "lucide-react";

type Role = "admin" | "player";
const NAV: { to: "/games" | "/players" | "/expenses" | "/cash"; label: string; roles: Role[] }[] = [
  { to: "/games", label: "Игры", roles: ["admin", "player"] },
  { to: "/players", label: "Досье", roles: ["admin"] },
  { to: "/expenses", label: "Затраты", roles: ["admin"] },
  { to: "/cash", label: "Итоговый кэш", roles: ["admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const loc = useLocation();

  if (!auth) return <>{children}</>;

  const handleLogout = () => {
    logout();
    // Hard redirect — clears any in-memory route state so protected URLs
    // can't be reached via back/forward without re-authenticating.
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    } else {
      router.navigate({ to: "/login" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 backdrop-blur bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">
          <Link to="/games" className="flex items-center gap-2 font-bold text-lg">
            <Spade className="text-primary" />
            <span>Покерный Менеджер</span>
          </Link>
          <nav className="flex gap-1 ml-6">
            {NAV.filter((n) => n.roles.includes(auth.role)).map((n) => {
              const active = loc.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`px-4 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{auth.name}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {auth.role === "admin" ? "Администратор" : "Игрок"}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="size-4" />
              Выйти
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">{children}</main>
    </div>
  );
}

export function AccessDenied() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Spade className="size-16 text-muted-foreground mb-4" />
      <h1 className="text-2xl font-bold mb-2">Раздел недоступен</h1>
      <p className="text-muted-foreground mb-6 max-w-md">
        Этот раздел доступен только администраторам клуба. Пожалуйста, выйдите и войдите как админ,
        либо вернитесь к списку игр.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => router.navigate({ to: "/games" })}>К играм</Button>
        <Button
          variant="outline"
          onClick={() => {
            logout();
            router.navigate({ to: "/login" });
          }}
        >
          Выйти
        </Button>
      </div>
    </div>
  );
}
