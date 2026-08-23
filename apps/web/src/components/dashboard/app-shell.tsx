"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@plan2classe-app/ui/components/breadcrumb";
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
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import { TooltipProvider } from "@plan2classe-app/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, LayoutDashboard, Plus, School, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Brand } from "@/components/brand";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";
import { orpc } from "@/utils/orpc";

const navigation = [
  { href: "/dashboard", label: "Mes classes", icon: LayoutDashboard },
  { href: "/dashboard/algorithm", label: "Comprendre le moteur", icon: BookOpen },
] as const;

const RECENT_CLASSES_SHOWN = 6;

function classroomIdFrom(pathname: string) {
  return pathname.match(/^\/dashboard\/classes\/([^/]+)/)?.[1] ?? null;
}

function AppBreadcrumb({ pathname }: { pathname: string }) {
  const classroomId = classroomIdFrom(pathname);
  // Shares the workspace's cache entry, so this never costs an extra request.
  const classroomQuery = useQuery({
    ...orpc.classroom.get.queryOptions({ input: { id: classroomId ?? "" } }),
    enabled: Boolean(classroomId),
  });

  if (pathname.startsWith("/dashboard/algorithm")) {
    return (
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink render={<Link href="/dashboard" />}>Mes classes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>Moteur d&rsquo;optimisation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (classroomId) {
    return (
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink render={<Link href="/dashboard" />}>Mes classes</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem className="min-w-0">
            {classroomQuery.isPending ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <BreadcrumbPage className="truncate">
                {classroomQuery.data?.classroom.name ?? "Espace de classe"}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>Mes classes</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function ClassroomNav({ activeId }: { activeId: string | null }) {
  const classes = useQuery(orpc.classroom.list.queryOptions());
  const items = classes.data?.items ?? [];

  if (classes.isPending) {
    return (
      <div className="grid gap-1.5 px-2 py-1 group-data-[collapsible=icon]:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Accès rapide</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.slice(0, RECENT_CLASSES_SHOWN).map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                render={<Link href={`/dashboard/classes/${item.id}`} />}
                isActive={item.id === activeId}
                tooltip={item.name}
                size="sm"
              >
                <School />
                <span className="truncate">{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeClassroomId = classroomIdFrom(pathname);

  return (
    <TooltipProvider>
      {/* A fixed-height frame: the content column owns scrolling, which is what
          makes the header and every in-page sticky panel actually stick. */}
      <SidebarProvider className="h-svh">
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader className="p-3">
            <Brand className="px-1 group-data-[collapsible=icon]:hidden" />
            <Brand compact className="hidden justify-center group-data-[collapsible=icon]:flex" />
          </SidebarHeader>
          <SidebarContent className="scrollbar-thin">
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
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/dashboard?create=1" />}
                      tooltip="Nouvelle classe"
                    >
                      <Plus />
                      <span>Nouvelle classe</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <ClassroomNav activeId={activeClassroomId} />
          </SidebarContent>
          <SidebarFooter className="p-3">
            <div className="flex items-center gap-2 rounded-lg border bg-background p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
              <Sparkles className="size-4 shrink-0 text-warning" />
              <p className="text-xs leading-4 text-muted-foreground group-data-[collapsible=icon]:hidden">
                Calcul exact par OR-Tools
              </p>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="hidden h-5 sm:block" />
            <div className="min-w-0 flex-1">
              <AppBreadcrumb pathname={pathname} />
            </div>
            <ModeToggle />
            <UserMenu />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
