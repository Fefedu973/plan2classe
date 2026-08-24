"use client";

import type {
  Classroom,
  ClassroomConfig,
  SolutionRecord,
} from "@plan2classe-app/api/schemas/classroom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@plan2classe-app/ui/components/alert";
import { Badge } from "@plan2classe-app/ui/components/badge";
import { Button } from "@plan2classe-app/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plan2classe-app/ui/components/card";
import { Progress } from "@plan2classe-app/ui/components/progress";
import { Skeleton } from "@plan2classe-app/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plan2classe-app/ui/components/table";
import { cn } from "@plan2classe-app/ui/lib/utils";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileDown,
  FileSpreadsheet,
  Gauge,
  History,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  UserCheck,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  defaultExportOptions,
  exportSolutionCsv,
  exportSolutionPdf,
  type PdfExportOptions,
} from "@/lib/export-plan";
import { orpc } from "@/utils/orpc";

import { ExportPdfDialog } from "./export-pdf-dialog";
import { RoomCanvas } from "./room-canvas";

type SolutionViewBaseProps = {
  classroomId: string;
  latestSolution?: SolutionRecord | null;
};

type SolutionViewProps = SolutionViewBaseProps &
  (
    | { classroom: Classroom; classroomName?: never; config?: never }
    | { classroom?: never; classroomName: string; config: ClassroomConfig }
  );

export function SolutionView(props: SolutionViewProps) {
  const { classroomId, latestSolution } = props;
  const classroom: Pick<Classroom, "name" | "config"> = props.classroom
    ? props.classroom
    : { name: props.classroomName, config: props.config };
  const queryClient = useQueryClient();
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const latestQuery = useQuery(
    orpc.solution.latest.queryOptions({ input: { classroomId } }),
  );
  const historyQuery = useQuery(
    orpc.solution.history.queryOptions({ input: { classroomId } }),
  );
  const solve = useMutation({
    ...orpc.solution.solve.mutationOptions(),
    onSuccess: async () => {
      setSelectedSolutionId(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.solution.latest.queryKey({ input: { classroomId } }),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.solution.history.queryKey({ input: { classroomId } }),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.classroom.get.queryKey({ input: { id: classroomId } }),
        }),
      ]);
      toast.success("Nouveau plan calculé");
    },
    onError: (error) => toast.error(error.message || "Le calcul n’a pas pu aboutir."),
  });

  const historyItems = historyQuery.data?.items ?? [];
  const currentLatest = latestQuery.data?.solution ?? latestSolution ?? null;
  const activeSolution =
    (selectedSolutionId
      ? historyItems.find((solution) => solution.id === selectedSolutionId)
      : null) ?? currentLatest;
  const isViewingHistory = Boolean(
    activeSolution && currentLatest && activeSolution.id !== currentLatest.id,
  );

  async function handlePdfExport(options: PdfExportOptions) {
    if (!activeSolution) return;
    setIsExportingPdf(true);
    try {
      await exportSolutionPdf({ classroom, solution: activeSolution }, options);
      setExportOpen(false);
      toast.success("PDF généré");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Export PDF impossible : ${error.message}`
          : "Export PDF impossible.",
      );
    } finally {
      setIsExportingPdf(false);
    }
  }

  function handleCsvExport() {
    if (!activeSolution) return;
    try {
      exportSolutionCsv({ classroom, solution: activeSolution });
      toast.success("CSV généré");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Export CSV impossible : ${error.message}`
          : "Export CSV impossible.",
      );
    }
  }

  if (latestQuery.isPending && latestSolution === undefined) {
    return <SolutionViewSkeleton />;
  }

  if (!activeSolution) {
    return (
      <EmptySolution
        classroomName={classroom.name}
        isSolving={solve.isPending}
        error={latestQuery.isError ? latestQuery.error.message : null}
        onSolve={() => solve.mutate({ classroomId })}
        onRetry={() => void latestQuery.refetch()}
      />
    );
  }

  const result = activeSolution.result;
  const movedCount = result.people.filter((person) => person.moved_from_previous).length;
  const responseCount = result.people.filter((person) => person.response_received).length;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">Plan calculé</h2>
            <StatusBadge status={result.status} />
            {isViewingHistory ? <Badge variant="outline">Version historique</Badge> : null}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {formatDate(result.generated_at)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{result.solver || "Solveur non renseigné"}</span>
            <span aria-hidden="true">·</span>
            <span>{Object.keys(result.assignment).length} élèves placés</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleCsvExport}>
            <FileSpreadsheet aria-hidden="true" />
            CSV
          </Button>
          <Button type="button" variant="outline" onClick={() => setExportOpen(true)}>
            <FileDown aria-hidden="true" />
            PDF
          </Button>
          <Button
            type="button"
            onClick={() => solve.mutate({ classroomId })}
            disabled={solve.isPending}
          >
            {solve.isPending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <WandSparkles aria-hidden="true" />
            )}
            Recalculer
          </Button>
        </div>
      </section>

      {result.status === "infeasible" || result.status === "error" ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>
            {result.status === "infeasible"
              ? "Aucun plan ne satisfait toutes les contraintes dures"
              : "Le calcul s’est terminé avec une erreur"}
          </AlertTitle>
          <AlertDescription>
            Consultez les diagnostics ci-dessous avant de modifier les règles puis relancez le
            calcul.
          </AlertDescription>
        </Alert>
      ) : null}

      <MetricGrid
        result={result}
        responseCount={responseCount}
        participantCount={classroom.config.participants.filter((participant) => participant.active)
          .length}
        movedCount={movedCount}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          <Card className="shadow-none">
            <CardHeader className="border-b px-4 py-4 sm:px-5">
              <CardTitle className="text-sm">Plan de la salle</CardTitle>
              <CardDescription>
                Survolez une place pour retrouver son libellé complet.
              </CardDescription>
              <CardAction>
                <Badge
                  variant={result.hard_constraints_verified ? "secondary" : "destructive"}
                  className="gap-1.5"
                >
                  {result.hard_constraints_verified ? (
                    <ShieldCheck aria-hidden="true" />
                  ) : (
                    <AlertTriangle aria-hidden="true" />
                  )}
                  {result.hard_constraints_verified ? "Contraintes vérifiées" : "À vérifier"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="p-3 sm:p-5">
              <RoomCanvas
                room={classroom.config.room}
                participants={classroom.config.participants}
                assignment={result.assignment}
                className="min-h-80"
              />
            </CardContent>
          </Card>

          <ConstraintProof solution={activeSolution} />
          <StageDetails solution={activeSolution} />
          <PeopleScores classroom={classroom} solution={activeSolution} />
          <Diagnostics diagnostics={result.diagnostics} />
        </div>

        <HistoryPanel
          latest={currentLatest}
          items={historyItems}
          selectedId={activeSolution.id}
          isLoading={historyQuery.isPending}
          error={historyQuery.isError ? historyQuery.error.message : null}
          onSelect={setSelectedSolutionId}
          onRefresh={() => void historyQuery.refetch()}
        />
      </div>

      <ExportPdfDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaults={defaultExportOptions(classroom, new Date(result.generated_at))}
        pending={isExportingPdf}
        onExport={(options) => void handlePdfExport(options)}
      />
    </div>
  );
}

function MetricGrid({
  result,
  responseCount,
  participantCount,
  movedCount,
}: {
  result: SolutionRecord["result"];
  responseCount: number;
  participantCount: number;
  movedCount: number;
}) {
  const metrics = [
    {
      label: "Équité minimale",
      value: formatNumber(result.min_satisfaction),
      description: "Score de l’élève le moins satisfait",
      icon: Scale,
    },
    {
      label: "Satisfaction moyenne",
      value: formatNumber(result.average_satisfaction, 1),
      description: "Moyenne sur tous les élèves placés",
      icon: Gauge,
    },
    {
      label: "Réponses prises en compte",
      value: `${responseCount} / ${participantCount}`,
      description: "Les élèves sans réponse restent placés",
      icon: UserCheck,
    },
    {
      label: "Stabilité du plan",
      value:
        result.unchanged_count === null
          ? "—"
          : `${result.unchanged_count} inchangé${result.unchanged_count > 1 ? "s" : ""}`,
      description: movedCount > 0 ? `${movedCount} déplacement${movedCount > 1 ? "s" : ""}` : "Aucun déplacement",
      icon: RefreshCw,
    },
  ] as const;

  return (
    <section aria-label="Métriques de la solution" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="gap-3 py-4 shadow-none">
          <CardContent className="px-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
                  {metric.value}
                </p>
              </div>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <metric.icon className="size-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ConstraintProof({ solution }: { solution: SolutionRecord }) {
  const { result } = solution;
  const modelStats = Object.entries(result.model_stats);

  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg",
              result.hard_constraints_verified
                ? "bg-success-muted text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {result.hard_constraints_verified ? (
              <CheckCircle2 className="size-5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-5" aria-hidden="true" />
            )}
          </span>
          <div>
            <CardTitle className="text-sm">Preuve de validité</CardTitle>
            <CardDescription className="mt-1 leading-5">
              {result.hard_constraints_verified
                ? "Le moteur a vérifié le respect de toutes les contraintes déclarées comme dures."
                : "Cette solution ne dispose pas d’une preuve complète pour les contraintes dures."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-1 sm:grid-cols-3">
        <ProofItem label="Solveur" value={result.solver || "—"} icon={Sparkles} />
        <ProofItem
          label="Statut"
          value={translateStatus(result.status)}
          icon={LockKeyhole}
        />
        <ProofItem
          label="Empreinte du modèle"
          value={modelStats.length > 0 ? `${modelStats.length} indicateurs` : "Non renseignée"}
          icon={BarChart3}
        />
        {modelStats.length > 0 ? (
          <details className="sm:col-span-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Afficher les statistiques techniques
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {modelStats.map(([key, value]) => (
                <Badge key={key} variant="outline" className="font-normal">
                  {humanizeKey(key)} : {formatValue(value)}
                </Badge>
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProofItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Sparkles;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/15 p-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function StageDetails({ solution }: { solution: SolutionRecord }) {
  const stages = solution.result.stages;

  return (
    <Card className="overflow-hidden py-0 shadow-none">
      <CardHeader className="border-b px-4 py-4 sm:px-5">
        <CardTitle className="text-sm">Étapes d’optimisation</CardTitle>
        <CardDescription>
          Chaque passe protège l’objectif précédent avant d’améliorer le suivant.
        </CardDescription>
      </CardHeader>
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Étape</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Objectif</TableHead>
            <TableHead className="text-right">Borne</TableHead>
            <TableHead className="text-right">Écart</TableHead>
            <TableHead className="text-right">Durée</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stages.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                Aucune étape détaillée n’a été enregistrée.
              </TableCell>
            </TableRow>
          ) : (
            stages.map((stage, index) => (
              <TableRow key={`${stage.name}-${index}`}>
                <TableCell className="font-medium">{stage.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{stage.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatNumber(stage.objective_value ?? null, 2)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatNumber(stage.best_bound ?? null, 2)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {stage.relative_gap === null || stage.relative_gap === undefined
                    ? "—"
                    : `${(stage.relative_gap * 100).toFixed(2)} %`}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {stage.wall_time_seconds.toFixed(2)} s
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function PeopleScores({
  classroom,
  solution,
}: {
  classroom: Pick<Classroom, "name" | "config">;
  solution: SolutionRecord;
}) {
  const participantById = useMemo(
    () => new Map(classroom.config.participants.map((person) => [person.id, person])),
    [classroom.config.participants],
  );
  const seatById = useMemo(
    () => new Map(classroom.config.room.seats.map((seat) => [seat.id, seat])),
    [classroom.config.room.seats],
  );
  const people = [...solution.result.people].sort(
    (a, b) => a.satisfaction - b.satisfaction,
  );

  return (
    <Card className="overflow-hidden py-0 shadow-none">
      <CardHeader className="border-b px-4 py-4 sm:px-5">
        <CardTitle className="text-sm">Satisfaction individuelle</CardTitle>
        <CardDescription>
          Triée du score le plus faible au plus élevé pour rendre l’équité contrôlable.
        </CardDescription>
      </CardHeader>
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Élève</TableHead>
            <TableHead>Place</TableHead>
            <TableHead>Réponse</TableHead>
            <TableHead className="min-w-44">Satisfaction</TableHead>
            <TableHead className="text-right">Score brut</TableHead>
            <TableHead className="w-36">Explication</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                Aucun score individuel n’est disponible.
              </TableCell>
            </TableRow>
          ) : (
            people.map((person) => {
              const participant = participantById.get(person.participant_id);
              const seat = seatById.get(person.seat_id);
              return (
                <TableRow key={person.participant_id}>
                  <TableCell>
                    <div className="font-medium">{participant?.name ?? person.participant_id}</div>
                    {person.moved_from_previous ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Déplacé depuis le plan précédent
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{seat?.label ?? person.seat_id}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={person.response_received ? "secondary" : "outline"}>
                      {person.response_received ? "Reçue" : "Absente"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress
                        className="min-w-24 flex-1"
                        value={Math.max(0, Math.min(100, person.satisfaction))}
                      />
                      <span className="w-8 text-right font-mono text-xs tabular-nums">
                        {person.satisfaction}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {person.raw_score}
                  </TableCell>
                  <TableCell>
                    {person.breakdown.length > 0 ? (
                      <details className="group/details">
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                          {person.breakdown.length} facteur
                          {person.breakdown.length > 1 ? "s" : ""}
                          <ChevronDown className="size-3 transition-transform group-open/details:rotate-180" aria-hidden="true" />
                        </summary>
                        <div className="mt-2 min-w-64 space-y-2 whitespace-normal">
                          {person.breakdown.map((item, index) => (
                            <RecordCard key={index} record={item} compact />
                          ))}
                        </div>
                      </details>
                    ) : (
                      <span className="text-xs text-muted-foreground">Non détaillé</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function Diagnostics({ diagnostics }: { diagnostics: Array<Record<string, unknown>> }) {
  if (diagnostics.length === 0) return null;

  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning-muted text-warning">
            <Info className="size-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-sm">Diagnostics du moteur</CardTitle>
            <CardDescription className="mt-1">
              Indications utiles pour comprendre ou corriger les compromis du modèle.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {diagnostics.map((diagnostic, index) => (
          <RecordCard key={index} record={diagnostic} />
        ))}
      </CardContent>
    </Card>
  );
}

function RecordCard({
  record,
  compact = false,
}: {
  record: Record<string, unknown>;
  compact?: boolean;
}) {
  const entries = Object.entries(record);
  const titleEntry = entries.find(([key]) =>
    ["name", "label", "kind", "type", "message", "reason"].includes(key),
  );
  const details = titleEntry ? entries.filter(([key]) => key !== titleEntry[0]) : entries;

  return (
    <div className={cn("rounded-lg border bg-muted/15", compact ? "p-2" : "p-3")}>
      <p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>
        {titleEntry ? formatValue(titleEntry[1]) : "Détail technique"}
      </p>
      {details.length > 0 ? (
        <dl className="mt-2 grid gap-1 text-[11px]">
          {details.map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">{humanizeKey(key)}</dt>
              <dd className="max-w-48 text-right font-mono break-words">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function HistoryPanel({
  latest,
  items,
  selectedId,
  isLoading,
  error,
  onSelect,
  onRefresh,
}: {
  latest: SolutionRecord | null;
  items: SolutionRecord[];
  selectedId: string;
  isLoading: boolean;
  error: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
}) {
  const uniqueItems = [
    ...(latest ? [latest] : []),
    ...items.filter((item) => item.id !== latest?.id),
  ];

  return (
    <aside className="self-start xl:sticky xl:top-16">
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="size-4" aria-hidden="true" />
            Historique
          </CardTitle>
          <CardDescription>Comparez les calculs conservés.</CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              aria-label="Actualiser l’historique"
              disabled={isLoading}
            >
              <RefreshCw className={cn(isLoading && "animate-spin")} aria-hidden="true" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && uniqueItems.length === 0 ? (
            Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Historique indisponible</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {uniqueItems.map((solution, index) => {
            const selected = selectedId === solution.id;
            return (
              <button
                key={solution.id}
                type="button"
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-foreground bg-muted/60" : "hover:bg-muted/30",
                )}
                onClick={() => onSelect(solution.id === latest?.id ? null : solution.id)}
                aria-pressed={selected}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">
                    {solution.id === latest?.id ? "Dernier calcul" : `Version ${uniqueItems.length - index}`}
                  </span>
                  <StatusBadge status={solution.result.status} compact />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {formatDate(solution.result.generated_at)}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Scale className="size-3 text-muted-foreground" aria-hidden="true" />
                  <span>min. {formatNumber(solution.result.min_satisfaction)}</span>
                  <span className="text-muted-foreground" aria-hidden="true">·</span>
                  <span>moy. {formatNumber(solution.result.average_satisfaction, 1)}</span>
                </div>
              </button>
            );
          })}

          {!isLoading && uniqueItems.length === 0 && !error ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aucun calcul antérieur.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: SolutionRecord["result"]["status"];
  compact?: boolean;
}) {
  const isSuccess = status === "optimal" || status === "feasible";
  return (
    <Badge
      variant={isSuccess ? "secondary" : status === "unknown" ? "outline" : "destructive"}
      className={cn("gap-1.5", compact && "h-4 px-1.5 text-[10px]")}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "optimal" && "bg-success",
          status === "feasible" && "bg-success/70",
          status === "unknown" && "bg-warning",
          (status === "infeasible" || status === "error") && "bg-destructive",
        )}
      />
      {translateStatus(status)}
    </Badge>
  );
}

function EmptySolution({
  classroomName,
  isSolving,
  error,
  onSolve,
  onRetry,
}: {
  classroomName: string;
  isSolving: boolean;
  error: string | null;
  onSolve: () => void;
  onRetry: () => void;
}) {
  return (
    <Card className="mx-auto max-w-2xl shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-14 text-center sm:px-12">
        <span className="grid size-14 place-items-center rounded-2xl border bg-muted/30">
          <WandSparkles className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-xl font-semibold tracking-tight">Aucun plan calculé</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Lancez l’optimisation pour placer les élèves de {classroomName} selon les contraintes et
          préférences disponibles.
        </p>
        {error ? (
          <Alert variant="destructive" className="mt-6 max-w-lg text-left">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Impossible de vérifier le dernier plan</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {error ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCw aria-hidden="true" />
              Réessayer
            </Button>
          ) : null}
          <Button type="button" onClick={onSolve} disabled={isSolving}>
            {isSolving ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <WandSparkles aria-hidden="true" />
            )}
            Calculer le premier plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SolutionViewSkeleton() {
  return (
    <div className="space-y-5" aria-label="Chargement du plan" aria-busy="true">
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
        <Skeleton className="h-[560px] rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

function translateStatus(status: SolutionRecord["result"]["status"]) {
  return {
    optimal: "Optimal",
    feasible: "Solution trouvée",
    infeasible: "Infaisable",
    unknown: "Indéterminé",
    error: "Erreur",
  }[status];
}

function formatNumber(value: number | null, fractionDigits = 0) {
  if (value === null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function humanizeKey(value: string) {
  const spaced = value.replaceAll("_", " ");
  return spaced.charAt(0).toLocaleUpperCase("fr") + spaced.slice(1);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") return new Intl.NumberFormat("fr-FR").format(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export type { SolutionViewProps };
