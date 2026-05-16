import { Spade } from "lucide-react";

export function AuthLoading({ label = "Загрузка..." }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <Spade className="size-10 text-primary animate-pulse" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
