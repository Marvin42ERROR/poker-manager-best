import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countPendingRequestsForMe } from "@/lib/membership";

export function NotificationsBell({ canManage }: { canManage: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    const refresh = async () => {
      try {
        const n = await countPendingRequestsForMe();
        if (alive) setCount(n);
      } catch {
        /* silent */
      }
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [canManage]);

  if (!canManage) return null;

  const hasPending = count > 0;
  return (
    <Button
      asChild
      variant="outline"
      size="icon"
      className="relative"
      aria-label={hasPending ? `Заявок: ${count}` : "Уведомления"}
      title={hasPending ? `Ожидают одобрения: ${count}` : "Нет новых уведомлений"}
    >
      <Link to="/notifications">
        <Bell
          className={`size-4 ${hasPending ? "text-red-500" : "text-muted-foreground"}`}
        />
        {hasPending && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
