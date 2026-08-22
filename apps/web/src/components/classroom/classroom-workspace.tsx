"use client";

import type { ClassroomConfig } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Input } from "@plan2classe-app/ui/components/input";
import { Label } from "@plan2classe-app/ui/components/label";
import { Progress } from "@plan2classe-app/ui/components/progress";
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plan2classe-app/ui/components/tabs";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileText,
  Gauge,
  LayoutGrid,
  Link2,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { ConstraintsEditor } from "./constraints-editor";
import { FormSettings } from "./form-settings";
import { ParticipantsEditor } from "./participants-editor";
import { ResponsesView } from "./responses-view";
import { RoomBuilder } from "./room-builder";
import { RoomCanvas } from "./room-canvas";
import { SolutionView } from "./solution-view";
import { SolverSettingsEditor } from "./solver-settings";

type WorkspaceTab =
  | "overview"
  | "room"
  | "participants"
  | "constraints"
  | "form"
  | "responses"
  | "solution"
  | "settings";

const tabItems: Array<{
  value: WorkspaceTab;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { value: "overview", label: "Vue d’ensemble", icon: LayoutGrid },
  { value: "room", label: "Salle", icon: SlidersHorizontal },
  { value: "participants", label: "Élèves", icon: Users },
  { value: "constraints", label: "Contraintes", icon: ListChecks },
  { value: "form", label: "Formulaire", icon: FileText },
  { value: "responses", label: "Réponses", icon: MessageSquareText },
  { value: "solution", label: "Plan calculé", icon: Sparkles },
  { value: "settings", label: "Réglages", icon: Settings2 },
];

function SetupOverview({
  config,
  responseCount,
  hasSolution,
  onNavigate,
}: {
  config: ClassroomConfig;
  responseCount: number;
  hasSolution: boolean;
  onNavigate: (tab: WorkspaceTab) => void;
}) {
  const participantCount = config.participants.filter((participant) => participant.active).length;
  const seatCount = config.room.seats.filter((seat) => seat.enabled).length;
  const enabledRules = config.rules.filter((rule) => rule.enabled).length;
  const checks = [
    {
      title: "Salle prête",
      description: `${seatCount} place${seatCount > 1 ? "s" : ""} active${seatCount > 1 ? "s" : ""}`,
      done: seatCount > 0 && seatCount >= participantCount,
      tab: "room" as const,
    },
    {
      title: "Liste des élèves",
      description: `${participantCount} élève${participantCount > 1 ? "s" : ""} actif${participantCount > 1 ? "s" : ""}`,
      done: participantCount > 0,
      tab: "participants" as const,
    },
    {
      title: "Contraintes vérifiées",
      description: `${enabledRules} règle${enabledRules > 1 ? "s" : ""} activée${enabledRules > 1 ? "s" : ""}`,
      done: true,
      tab: "constraints" as const,
    },
    {
      title: "Collecte en cours",
      description: `${responseCount} réponse${responseCount > 1 ? "s" : ""} reçue${responseCount > 1 ? "s" : ""}`,
      done: responseCount > 0,
      tab: "responses" as const,
    },
    {
      title: "Plan optimal calculé",
      description: hasSolution ? "Un résultat exportable est disponible" : "Lancez le moteur quand vous êtes prêt",
      done: hasSolution,
      tab: "solution" as const,
    },
  ];
  const completed = checks.filter((check) => check.done).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="overflow-hidden shadow-none">
        <CardHeader className="flex-row items-center justify-between border-b">
          <div>
            <CardTitle>Aperçu de la salle</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Le dernier plan reste affiché pendant que vous préparez le suivant.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onNavigate("room")}>
            Modifier
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          <RoomCanvas room={config.room} participants={config.participants} className="min-h-96" />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="shadow-none">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Préparation</CardTitle>
              <Badge variant="secondary">{completed} / {checks.length}</Badge>
            </div>
            <Progress value={(completed / checks.length) * 100} />
          </CardHeader>
          <CardContent className="grid gap-1">
            {checks.map((check) => (
              <button
                key={check.title}
                type="button"
                onClick={() => onNavigate(check.tab)}
                className="flex items-start gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted"
              >
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                    check.done ? "border-foreground bg-foreground text-background" : "text-muted-foreground"
                  }`}
                >
                  {check.done && <Check className="size-3" />}
                </span>
                <span>
                  <span className="block text-sm font-medium">{check.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{check.description}</span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-dashed bg-muted/30 shadow-none">
          <CardContent className="p-5">
            <BookOpenCheck className="size-5" />
            <p className="mt-3 text-sm font-medium">Ordre de priorité du moteur</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Faisabilité, équité max-min, satisfaction globale, stabilité puis départage déterministe.
            </p>
            <Button className="mt-4" size="sm" variant="outline" render={<Link href="/dashboard/algorithm" />}>
              Comprendre le calcul
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoadingWorkspace() {
  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-80" /></div>
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-[560px] w-full rounded-2xl" />
    </div>
  );
}

export function ClassroomWorkspace({ classroomId }: { classroomId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const classroomQuery = useQuery(orpc.classroom.get.queryOptions({ input: { id: classroomId } }));
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [config, setConfig] = useState<ClassroomConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  const classroom = classroomQuery.data?.classroom;

  useEffect(() => {
    if (!classroom) return;
    setConfig(classroom.config);
    setName(classroom.name);
    setSlug(classroom.slug);
    setDescription(classroom.description);
    setDirty(false);
  }, [classroom]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.classroom.get.queryKey({ input: { id: classroomId } }) });

  const save = useMutation({
    ...orpc.classroom.update.mutationOptions(),
    onSuccess: () => {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: orpc.classroom.list.queryKey() });
      setDirty(false);
      toast.success("Modifications enregistrées");
    },
    onError: (error) => toast.error(error.message),
  });
  const duplicate = useMutation({
    ...orpc.classroom.duplicate.mutationOptions(),
    onSuccess: ({ classroom: copy }) => {
      toast.success("Classe dupliquée");
      router.push(`/dashboard/classes/${copy.id}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    ...orpc.classroom.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Classe supprimée");
      router.push("/dashboard");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateConfig = (next: ClassroomConfig) => {
    setConfig(next);
    setDirty(true);
  };
  const activeParticipants = useMemo(
    () => config?.participants.filter((participant) => participant.active).length ?? 0,
    [config?.participants],
  );
  const seatCount = config?.room.seats.filter((seat) => seat.enabled).length ?? 0;
  const responseCount = classroomQuery.data?.responseCount ?? 0;
  const publicPath = classroom ? `/f/${classroom.slug}` : "";
  const canPublish = activeParticipants > 0 && seatCount >= activeParticipants;

  if (classroomQuery.isLoading || !config) return <LoadingWorkspace />;
  if (classroomQuery.isError || !classroom) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Classe introuvable</h1>
          <p className="mt-2 text-sm text-muted-foreground">Elle a peut-être été supprimée ou ne vous appartient pas.</p>
          <Button className="mt-5" render={<Link href="/dashboard" />}><ArrowLeft /> Retour aux classes</Button>
        </div>
      </div>
    );
  }

  const persist = () => {
    save.mutate({ id: classroomId, name, slug, description, config });
  };
  const togglePublished = (published: boolean) => {
    if (published && !canPublish) {
      toast.error("Ajoutez au moins un élève et assez de places avant d’ouvrir le formulaire.");
      return;
    }
    save.mutate({ id: classroomId, published });
  };

  return (
    <main className="mx-auto w-full max-w-[1680px] p-3 md:p-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button size="icon" variant="ghost" render={<Link href="/dashboard" />} aria-label="Retour aux classes">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{classroom.name}</h1>
              <Badge variant={classroom.published ? "default" : "secondary"}>
                {classroom.published ? "Formulaire ouvert" : "Brouillon"}
              </Badge>
              {dirty && <Badge variant="outline">Non enregistré</Badge>}
            </div>
            <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">
              {classroom.description || "Préparez la salle, collectez les souhaits et calculez le plan le plus équitable."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-lg border bg-card px-3">
            <Switch
              checked={classroom.published}
              onCheckedChange={togglePublished}
              disabled={save.isPending}
              aria-label="Ouvrir le formulaire public"
            />
            <span className="text-xs font-medium">Collecte</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!classroom.published}
            onClick={() => {
              void navigator.clipboard.writeText(new URL(publicPath, window.location.origin).toString());
              toast.success("Lien public copié");
            }}
          >
            <Clipboard /> Copier le lien
          </Button>
          <Button size="sm" variant="outline" render={<Link href={publicPath as Route} target="_blank" />}>
            <ExternalLink /> Ouvrir
          </Button>
          <Button size="sm" onClick={persist} disabled={!dirty || save.isPending}>
            {save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
            Enregistrer
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)}>
        <div className="mb-5 overflow-x-auto border-b">
          <TabsList variant="line" className="h-11 min-w-max">
            {tabItems.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="px-3">
                <item.icon /> {item.label}
                {item.value === "responses" && responseCount > 0 && <Badge className="h-5 px-1.5">{responseCount}</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <SetupOverview
            config={config}
            responseCount={responseCount}
            hasSolution={Boolean(classroomQuery.data?.latestSolution)}
            onNavigate={setTab}
          />
        </TabsContent>
        <TabsContent value="room">
          <RoomBuilder room={config.room} onChange={(room) => updateConfig({ ...config, room })} />
        </TabsContent>
        <TabsContent value="participants">
          <ParticipantsEditor
            participants={config.participants}
            onChange={(participants) => updateConfig({ ...config, participants })}
          />
        </TabsContent>
        <TabsContent value="constraints">
          <ConstraintsEditor
            rules={config.rules}
            participants={config.participants}
            room={config.room}
            onChange={(rules) => updateConfig({ ...config, rules })}
          />
        </TabsContent>
        <TabsContent value="form">
          <FormSettings
            form={config.form}
            slug={classroom.slug}
            published={classroom.published}
            participantCount={activeParticipants}
            onChange={(form) => updateConfig({ ...config, form })}
          />
        </TabsContent>
        <TabsContent value="responses"><ResponsesView classroomId={classroomId} /></TabsContent>
        <TabsContent value="solution">
          <SolutionView
            classroomId={classroomId}
            classroomName={classroom.name}
            config={config}
            latestSolution={classroomQuery.data?.latestSolution ?? null}
          />
        </TabsContent>
        <TabsContent value="settings">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <Card className="shadow-none">
                <CardHeader><CardTitle>Informations</CardTitle></CardHeader>
                <CardContent className="grid gap-5">
                  <div className="grid gap-2"><Label htmlFor="class-name">Nom</Label><Input id="class-name" value={name} onChange={(event) => { setName(event.target.value); setDirty(true); }} /></div>
                  <div className="grid gap-2"><Label htmlFor="class-description">Description</Label><Textarea id="class-description" value={description} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} /></div>
                  <div className="grid gap-2"><Label htmlFor="class-slug">Adresse publique</Label><div className="flex items-center gap-2"><Link2 className="size-4 text-muted-foreground" /><Input id="class-slug" value={slug} onChange={(event) => { setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setDirty(true); }} /></div></div>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardHeader><CardTitle>Réglages du solveur</CardTitle></CardHeader>
                <CardContent>
                  <SolverSettingsEditor settings={config.settings} onChange={(settings) => updateConfig({ ...config, settings })} />
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="shadow-none">
                <CardHeader><CardTitle className="text-sm">Gestion</CardTitle></CardHeader>
                <CardContent className="grid gap-2">
                  <Button variant="outline" disabled={duplicate.isPending} onClick={() => duplicate.mutate({ id: classroomId })}>Dupliquer cette classe</Button>
                  <Button
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Supprimer définitivement « ${classroom.name} » et toutes ses réponses ?`)) remove.mutate({ id: classroomId });
                    }}
                  >
                    <Trash2 /> Supprimer
                  </Button>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm font-medium"><Gauge className="size-4" /> Capacité</div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg bg-muted p-3"><p className="text-xl font-semibold tabular-nums">{activeParticipants}</p><p className="text-xs text-muted-foreground">élèves</p></div>
                    <div className="rounded-lg bg-muted p-3"><p className="text-xl font-semibold tabular-nums">{seatCount}</p><p className="text-xs text-muted-foreground">places</p></div>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {canPublish ? <CheckCircle2 className="size-3.5" /> : <ListChecks className="size-3.5" />}
                    {canPublish ? "La classe peut être publiée." : "Il manque des places ou des élèves."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
