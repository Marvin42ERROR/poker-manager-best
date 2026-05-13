import { createFileRoute } from "@tanstack/react-router";
import { AppShell, AccessDenied } from "@/components/AppShell";

export const Route = createFileRoute("/no-access")({
  component: () => (
    <AppShell>
      <AccessDenied />
    </AppShell>
  ),
});
