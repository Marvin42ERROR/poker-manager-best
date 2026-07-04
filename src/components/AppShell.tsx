import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { useAuth, logout, setActiveClub, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Spade, ChevronDown, Crown, LifeBuoy } from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { canManageActiveClub } from "@/lib/membership";


type LegacyRole = "admin" | "player";
const NAV: { to: "/games" | "/players" | "/expenses" | "/cash" | "/members"; label: string; roles: LegacyRole[] }[] = [
  { to: "/games", label: "Игры", roles: ["admin", "player"] },
  { to: "/members", label: "Участники", roles: ["admin", "player"] },
  { to: "/players", label: "Досье", roles: ["admin"] },
  { to: "/expenses", label: "Затраты", roles: ["admin"] },
  { to: "/cash", label: "Итоговый кэш", roles: ["admin"] },
];

const ROLE_LABEL: Record<AppRole, string> = {
  creator: "Создатель",
  owner: "Владелец",
  co_owner: "Со-владелец",
  manager: "Менеджер",
  dealer: "Дилер",
  player: "Игрок",
};


export function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const loc = useLocation();

  if (!auth) return <>{children}</>;

  const handleLogout = async () => {
    await logout();
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    } else {
      router.navigate({ to: "/login" });
    }
  };

  const switchClub = async (id: string) => {
    if (id === auth.activeClubId) return;
    await setActiveClub(id);
    router.navigate({ to: "/games" });
  };

  const goSelectClub = () => router.navigate({ to: "/select-club" });

  const showSwitcher = auth.isCreator || auth.clubs.length > 1;
  const headerRoleLabel = auth.supportMode
    ? "Support (Owner-доступ)"
    : ROLE_LABEL[auth.appRole];

  return (
    <div className="min-h-screen flex flex-col">
      {auth.supportMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/40 text-amber-900 dark:text-amber-200">
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-2 text-xs">
            <LifeBuoy className="size-4 shrink-0" />
            <span>
              <strong>Support Mode.</strong> Вы вошли как Создатель в клуб
              «{auth.activeClubName}» с временным доступом уровня Owner. Действия
              отображаются в журнале как «System Support».
            </span>
            <button
              onClick={goSelectClub}
              className="ml-auto underline underline-offset-2 hover:no-underline"
            >
              Сменить клуб
            </button>
          </div>
        </div>
      )}
      <header className="border-b border-border/60 backdrop-blur bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6 flex-wrap">
          <Link to="/games" className="flex items-center gap-2 font-bold text-lg">
            <Spade className="text-primary" />
            <span>Покерный Менеджер</span>
          </Link>

          {/* Active club / club switcher */}
          {auth.clubs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  {auth.supportMode ? (
                    <LifeBuoy className="size-3.5 text-amber-500" />
                  ) : auth.isCreator ? (
                    <Crown className="size-3.5 text-amber-500" />
                  ) : null}
                  <span className="max-w-[220px] truncate">
                    {auth.activeClubName ?? "Выбрать клуб"}
                    {!auth.supportMode && auth.activeClubId && (
                      <span className="ml-1 text-muted-foreground">
                        ({ROLE_LABEL[auth.appRole]})
                      </span>
                    )}
                  </span>
                  {showSwitcher && <ChevronDown className="size-3.5 opacity-60" />}
                </Button>
              </DropdownMenuTrigger>
              {showSwitcher && (
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuLabel>
                    {auth.isCreator ? "Все клубы (Создатель)" : "Ваши клубы"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {auth.clubs.map((c) => {
                    const isActive = c.id === auth.activeClubId;
                    const roleText = auth.isCreator
                      ? "Support"
                      : ROLE_LABEL[c.role];
                    return (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => switchClub(c.id)}
                        className={isActive ? "bg-accent" : ""}
                      >
                        <div className="flex w-full items-center justify-between gap-3 min-w-0">
                          <span className="truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {roleText}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={goSelectClub}>
                    Все клубы…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          )}

          <nav className="flex gap-1">
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
            <NotificationsBell
              canManage={canManageActiveClub({
                isCreator: auth.isCreator,
                appRole: auth.appRole,
              })}
            />
            <div className="text-right">
              <div className="text-sm font-medium">{auth.name}</div>
              <div className="text-xs text-muted-foreground">{headerRoleLabel}</div>
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
          onClick={async () => {
            await logout();
            router.navigate({ to: "/login" });
          }}
        >
          Выйти
        </Button>
      </div>
    </div>
  );
}
