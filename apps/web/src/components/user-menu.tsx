"use client";

import { Button } from "@plan2classe-app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plan2classe-app/ui/components/dropdown-menu";
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import { BookOpen, ChevronDown, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { LinkButton } from "@/components/common/link-button";
import { authClient } from "@/lib/auth-client";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase("fr") ?? "")
      .join("") || "?"
  );
}

export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);

  if (isPending) {
    return <Skeleton className="h-8 w-24" />;
  }

  if (!session) {
    return (
      <LinkButton variant="outline" size="sm" href="/login">
        Se connecter
      </LinkButton>
    );
  }

  const name = session.user.name;
  const handle = session.user.username ?? name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="gap-2 px-1.5" aria-label="Menu du compte" />}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">
          {initials(name)}
        </span>
        <span className="hidden max-w-32 truncate sm:block">{name}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card">
        {/* Not a DropdownMenuLabel: that maps to Base UI's `Menu.GroupLabel`,
            which throws unless it sits inside a `Menu.Group`. */}
        <div className="grid gap-0.5 px-1.5 py-1">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">@{handle}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/dashboard" />}>
            <LayoutDashboard /> Mes classes
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/algorithm" />}>
            <BookOpen /> Comprendre le moteur
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  router.push("/");
                  router.refresh();
                },
                onError: () => {
                  setSigningOut(false);
                  toast.error("Déconnexion impossible. Réessayez.");
                },
              },
            });
          }}
        >
          <LogOut /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
