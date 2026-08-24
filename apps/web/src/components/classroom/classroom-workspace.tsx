"use client";

import type { ClassroomConfig } from "@plan2classe-app/api/schemas/classroom";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@plan2classe-app/ui/components/card";
import { Input } from "@plan2classe-app/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@plan2classe-app/ui/components/input-group";
import { Label } from "@plan2classe-app/ui/components/label";
import { Progress } from "@plan2classe-app/ui/components/progress";
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import { Switch } from "@plan2classe-app/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plan2classe-app/ui/components/tabs";
import { Textarea } from "@plan2classe-app/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@plan2classe-app/ui/components/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  ExternalLink,
  FileText,
  Gauge,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { LinkButton } from "@/components/common/link-button";
import { orpc } from "@/utils/orpc";

import { ConstraintsEditor } from "./constraints-editor";
import { FormSettings } from "./form-settings";
import { ParticipantsEditor } from "./participants-editor";
import { ResponsesView } from "./responses-view";
import { RoomBuilder } from "./room-builder";
import { RoomCanvas } from "./room-canvas";
import { SolutionView } from "./solution-view";
import { SolverSettingsEditor } from "./solver-settings";
import { TagsManager } from "./tags-manager";

type WorkspaceTab =
  | "overview"
  | "room"
  | "participants"
  | "tags"
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
  { value: "tags", label: "Tags", icon: Tag },
  { value: "constraints", label: "Contraintes", icon: ListChecks },
  { value: "form", label: "Formulaire", icon: FileText },
  { value: "responses", label: "Réponses", icon: MessageSquareText },
  { value: "solution", label: "Plan calculé", icon: Sparkles },
  { value: "settings", label: "Réglages", icon: Settings2 },
];

async function copyToClipboard(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error("Copie impossible. Sélectionnez le lien puis copiez-le manuellement.");
  }
}

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
      description:
        seatCount === 0
          ? "Aucune place active"
          : seatCount < participantCount
            ? `${seatCount} place${seatCount > 1 ? "s" : ""} pour ${participantCount} élèves`
            : `${seatCount} place${seatCount > 1 ? "s" : ""} active${seatCount > 1 ? "s" : ""}`,
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
      description: hasSolution
        ? "Un résultat exportable est disponible"
        : "Lancez le moteur quand vous êtes prêt",
      done: hasSolution,
      tab: "solution" as const,
    },
  ];
  const completed = checks.filter((check) => check.done).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="border-b px-4 py-4 sm:px-5">
          <CardTitle className="text-sm">Aperçu de la salle</CardTitle>
          <p className="text-xs text-muted-foreground">
            Le dernier plan reste affiché pendant que vous préparez le suivant.
          </p>
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => onNavigate("room")}>
              <SlidersHorizontal /> Modifier
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <RoomCanvas room={config.room} participants={config.participants} className="min-h-96" />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="shadow-none xl:sticky xl:top-4">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm">Préparation</CardTitle>
              <Badge variant="secondary" className="tabular-nums">
                {completed} / {checks.length}
              </Badge>
            </div>
            <Progress value={(completed / checks.length) * 100} />
          </CardHeader>
          <CardContent className="grid gap-0.5">
            {checks.map((check) => (
              <button
                key={check.title}
                type="button"
                onClick={() => onNavigate(check.tab)}
                className="flex items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-muted-foreground ${
                    check.done ? "border-success bg-success text-success-foreground" : ""
                  }`}
                >
                  {check.done && <Check className="size-3" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{check.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {check.description}
                  </span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-dashed bg-muted/30 shadow-none">
          <CardContent className="p-5">
            <BookOpenCheck className="size-5" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">Ordre de priorité du moteur</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Faisabilité, équité max-min, satisfaction globale, stabilité puis départage
              déterministe.
            </p>
            <LinkButton className="mt-4" size="sm" variant="outline" href="/dashboard/algorithm">
              Comprendre le calcul
            </LinkButton>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoadingWorkspace() {
  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-5 p-3 md:p-6" aria-busy="true">
      <div className="flex items-start gap-3">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[520px] rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
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
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    queryClient.invalidateQueries({
      queryKey: orpc.classroom.get.queryKey({ input: { id: classroomId } }),
    });

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
      void queryClient.invalidateQueries({ queryKey: orpc.classroom.list.queryKey() });
      toast.success("Classe dupliquée");
      router.push(`/dashboard/classes/${copy.id}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    ...orpc.classroom.delete.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.classroom.list.queryKey() });
      setDeleteOpen(false);
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

  const persist = useCallback(() => {
    if (!config) return;
    save.mutate({ id: classroomId, name, slug, description, config });
  }, [classroomId, config, description, name, save, slug]);

  // Editing happens entirely client-side until "Enregistrer", so leaving with
  // pending edits would silently discard them.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !save.isPending) persist();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, persist, save.isPending]);

  if (classroomQuery.isLoading || !config) return <LoadingWorkspace />;
  if (classroomQuery.isError || !classroom) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border bg-muted/40">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Classe introuvable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Elle a peut-être été supprimée ou ne vous appartient pas.
          </p>
          <LinkButton className="mt-5" href="/dashboard">
            <ArrowLeft /> Retour aux classes
          </LinkButton>
        </div>
      </div>
    );
  }

  const togglePublished = (published: boolean) => {
    if (published && !canPublish) {
      toast.error("Ajoutez au moins un élève et assez de places avant d’ouvrir le formulaire.", {
        description: `${activeParticipants} élève(s) actif(s) pour ${seatCount} place(s).`,
      });
      return;
    }
    save.mutate({ id: classroomId, published });
  };

  return (
    <main className="mx-auto w-full max-w-[1680px] p-3 md:p-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <LinkButton
            size="icon"
            variant="ghost"
            href="/dashboard"
            aria-label="Retour aux classes"
            className="mt-0.5 shrink-0"
          >
            <ArrowLeft />
          </LinkButton>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
                {classroom.name}
              </h1>
              <Badge variant={classroom.published ? "default" : "secondary"}>
                {classroom.published ? "Formulaire ouvert" : "Brouillon"}
              </Badge>
              {dirty && (
                <Badge variant="outline" className="gap-1.5 border-warning/50 text-warning">
                  <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                  Non enregistré
                </Badge>
              )}
            </div>
            <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {classroom.description ||
                "Préparez la salle, collectez les souhaits et calculez le plan le plus équitable."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={<div className="flex h-8 items-center gap-2 rounded-lg border bg-card px-3" />}
            >
              <Switch
                checked={classroom.published}
                onCheckedChange={togglePublished}
                disabled={save.isPending}
                aria-label="Ouvrir le formulaire public"
              />
              <span className="text-xs font-medium">Collecte</span>
            </TooltipTrigger>
            <TooltipContent>
              {classroom.published
                ? "Le formulaire public accepte les réponses."
                : "Ouvrez la collecte pour partager le formulaire aux élèves."}
            </TooltipContent>
          </Tooltip>
          <Button
            size="sm"
            variant="outline"
            disabled={!classroom.published}
            onClick={() =>
              void copyToClipboard(
                new URL(publicPath, window.location.origin).toString(),
                "Lien public copié",
              )
            }
          >
            <Clipboard /> Copier le lien
          </Button>
          <LinkButton
            size="sm"
            variant="outline"
            disabled={!classroom.published}
            href={publicPath as Route}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink /> Ouvrir
          </LinkButton>
          <Button size="sm" onClick={persist} disabled={!dirty || save.isPending}>
            {save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
            Enregistrer
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)}>
        {/* Sticky inside the dashboard scroll column; `overflow-y-hidden` keeps
            the horizontal strip from growing a stray vertical scrollbar. */}
        <div className="sticky top-0 z-20 -mx-3 mb-5 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:-mx-6 md:px-6">
          <div className="scrollbar-none overflow-x-auto overflow-y-hidden">
            <TabsList variant="line" className="h-11 w-full min-w-max justify-start gap-1">
              {tabItems.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="flex-none px-3">
                  <item.icon /> {item.label}
                  {item.value === "responses" && responseCount > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">
                      {responseCount}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
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
            seatCount={seatCount}
            settings={config.settings}
            onOpenSettings={() => setTab("settings")}
            onChange={(participants) => updateConfig({ ...config, participants })}
          />
        </TabsContent>
        <TabsContent value="tags">
          <TagsManager config={config} onChange={updateConfig} />
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
        <TabsContent value="responses">
          <ResponsesView classroomId={classroomId} />
        </TabsContent>
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
            <div className="min-w-0 space-y-5">
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle className="text-sm">Informations</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="class-name">Nom</Label>
                    <Input
                      id="class-name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="class-description">Description</Label>
                    <Textarea
                      id="class-description"
                      className="min-h-24"
                      value={description}
                      onChange={(event) => {
                        setDescription(event.target.value);
                        setDirty(true);
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="class-slug">Adresse publique</Label>
                    <InputGroup>
                      <InputGroupAddon>/f/</InputGroupAddon>
                      <InputGroupInput
                        id="class-slug"
                        value={slug}
                        spellCheck={false}
                        autoCapitalize="none"
                        onChange={(event) => {
                          setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                          setDirty(true);
                        }}
                      />
                    </InputGroup>
                    <p className="text-xs text-muted-foreground">
                      Lettres minuscules, chiffres et tirets. Changer l’adresse invalide les liens
                      déjà distribués.
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle className="text-sm">Réglages du solveur</CardTitle>
                </CardHeader>
                <CardContent>
                  <SolverSettingsEditor
                    settings={config.settings}
                    onChange={(settings) => updateConfig({ ...config, settings })}
                  />
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
              <Card className="shadow-none">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Gauge className="size-4" aria-hidden="true" /> Capacité
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg bg-muted p-3">
                      <p className="text-xl font-semibold tabular-nums">{activeParticipants}</p>
                      <p className="text-xs text-muted-foreground">élèves</p>
                    </div>
                    <div className="rounded-lg bg-muted p-3">
                      <p className="text-xl font-semibold tabular-nums">{seatCount}</p>
                      <p className="text-xs text-muted-foreground">places</p>
                    </div>
                  </div>
                  <p
                    className={`mt-3 flex items-center gap-1.5 text-xs ${canPublish ? "text-success" : "text-warning"}`}
                  >
                    {canPublish ? (
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    ) : (
                      <TriangleAlert className="size-3.5" aria-hidden="true" />
                    )}
                    {canPublish
                      ? "La classe peut être publiée."
                      : "Il manque des places ou des élèves."}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardHeader>
                  <CardTitle className="text-sm">Gestion</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    variant="outline"
                    disabled={duplicate.isPending}
                    onClick={() => duplicate.mutate({ id: classroomId })}
                  >
                    {duplicate.isPending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Copy />
                    )}
                    Dupliquer cette classe
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 /> Supprimer
                  </Button>
                  <p className="text-xs leading-5 text-muted-foreground">
                    La suppression retire aussi les réponses et l’historique des plans.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Supprimer cette classe ?"
        description={`« ${classroom.name} » sera définitivement supprimée. Cette action est irréversible.`}
        detail={
          <>
            Seront également supprimés : {responseCount} réponse
            {responseCount > 1 ? "s" : ""} d’élèves, l’historique des plans calculés et le lien
            public <span className="font-mono">{publicPath}</span>.
          </>
        }
        confirmLabel="Supprimer définitivement"
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ id: classroomId })}
      />
    </main>
  );
}
