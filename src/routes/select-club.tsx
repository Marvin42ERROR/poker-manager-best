import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, setActiveClub, logout, type AppRole } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spade, LogOut, Crown, ShieldCheck } from "lucide-react";
import { getAuth } from "@/lib/auth";

const ROLE_LABEL: Record<AppRole, string> = {
  creator: "Создатель",
  owner: "Владелец",
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
    // Anyone signed in with at least one club may use this page.
    // Regular users with exactly one club are auto-routed straight to /games.
    if (!a.isCreator && a.clubs.length === 1 && a.activeClubId) {
      throw redirect({ to: "/games" });
    }
    if (!a.isCreator && a.clubs.length === 0) {
      throw redirect({ to: "/no-access" });
    }
  },
});

function SelectClubPage() {
  const auth = useAuth();
  const navigate = Route.useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl p-8 bg-card/80 backdrop-blur border-border/60">
        <div className="flex flex-col items-center mb-6 text-center">
          <Spade className="size-10 text-primary mb-2" />
          <h1 className="text-2xl font-bold">Выберите клуб</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {auth.isCreator
              ? "Вы вошли как Создатель — у вас доступ ко всем клубам системы."
              : "Вы состоите в нескольких клубах. Выберите, в какой войти."}
          </p>
        </div>

        {auth.clubs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Пока нет ни одного клуба.
          </p>
        ) : (
          <div className="grid gap-2">
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
    </div>
  );
}
