import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuth, setActiveClub, getAuth, logout } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spade, LogOut } from "lucide-react";

export const Route = createFileRoute("/select-club")({
  component: SelectClubPage,
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const a = getAuth();
    if (!a) throw redirect({ to: "/login" });
    if (!a.isCreator) throw redirect({ to: "/games" });
  },
});

function SelectClubPage() {
  const auth = useAuth();
  const navigate = Route.useNavigate();

  if (!auth) return null;

  const pick = (clubId: string) => {
    setActiveClub(clubId);
    navigate({ to: "/games" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl p-8 bg-card/80 backdrop-blur border-border/60">
        <div className="flex flex-col items-center mb-6 text-center">
          <Spade className="size-10 text-primary mb-2" />
          <h1 className="text-2xl font-bold">Выберите клуб</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Вы вошли как Создатель — у вас доступ ко всем клубам в системе.
          </p>
        </div>

        {auth.clubs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Пока нет ни одного клуба. Зарегистрируйте владельца — у него появится клуб.
          </p>
        ) : (
          <div className="grid gap-2">
            {auth.clubs.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3 text-left transition-colors hover:bg-accent"
              >
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">ID: {c.id.slice(0, 8)}…</div>
                </div>
                <span className="text-xs text-primary">Открыть →</span>
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
