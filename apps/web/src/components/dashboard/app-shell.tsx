"use client";

import { Button } from "@plan2classe-app/ui/components/button";
import { Separator } from "@plan2classe-app/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@plan2classe-app/ui/components/sidebar";
import { TooltipProvider } from "@plan2classe-app/ui/components/tooltip";
import { BookOpen, LayoutDashboard, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Brand } from "@/components/brand";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";

const navigation = [
  { href: "/dashboard", label: "Mes classes", icon: LayoutDashboard },
  { href: "/dashboard/algorithm", label: "Comprendre le moteur", icon: BookOpen },
] as const;

function currentTitle(pathname: string) {
  if (pathname.includes("/algorithm")) return "Moteur d’optimisation";
  if (pathname.includes("/classes/")) return "Espace de classe";
  return "Mes classes";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader className="p-3">
            <Brand className="px-1 group-data-[collapsible=icon]:hidden" />
            <Brand compact className="hidden justify-center group-data-[collapsible=icon]:flex" />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Enseignant</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={
                          item.href === "/dashboard"
                            ? pathname === "/dashboard"
                            : pathname.startsWith(item.href)
                        }
                        tooltip={item.label}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Créer</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton render={<Link href="/dashboard?create=1" />} tooltip="Nouvelle classe">
                      <Plus />
                      <span>Nouvelle classe</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-3">
            <div className="flex items-center gap-2 rounded-lg border bg-background p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
              <Sparkles className="size-4 shrink-0 text-amber-500" />
              <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Calcul exact par OR-Tools
              </p>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-w-0 overflow-hidden">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{currentTitle(pathname)}</p>
            <ModeToggle />
            <UserMenu />
          </header>
          <div className="min-h-0 flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
