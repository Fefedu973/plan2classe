import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/dashboard/app-shell";
import { authClient } from "@/lib/auth-client";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session.data?.user) redirect("/login");

  return <AppShell>{children}</AppShell>;
}
