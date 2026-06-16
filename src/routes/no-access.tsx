import { createFileRoute } from "@tanstack/react-router";
import { AppShell, AccessDenied } from "@/components/AppShell";

export const Route = createFileRoute("/no-access")({
  ssr: false,
  component: () => (
    <AppShell>
      <AccessDenied />
    </AppShell>
  ),
});
