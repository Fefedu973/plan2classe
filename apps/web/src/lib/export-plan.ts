import type { Classroom, SolutionRecord } from "@plan2classe-app/api/schemas/classroom";

type PlanClassroom = Pick<Classroom, "name" | "config">;

type ExportPlanInput = {
  classroom: PlanClassroom;
  solution: SolutionRecord;
};

type PdfDocument = {
  internal: {
    pageSize: {
      getWidth: () => number;
      getHeight: () => number;
    };
  };
  setProperties: (properties: Record<string, string>) => void;
  setFont: (fontName: string, fontStyle?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setFillColor: (r: number, g?: number, b?: number) => void;
  setLineWidth: (width: number) => void;
  text: (
    text: string | string[],
    x: number,
    y: number,
    options?: { align?: "left" | "center" | "right"; angle?: number; baseline?: string },
  ) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, width: number, height: number, style?: string) => void;
  roundedRect: (
    x: number,
    y: number,
    width: number,
    height: number,
    rx: number,
    ry: number,
    style?: string,
  ) => void;
  ellipse: (x: number, y: number, rx: number, ry: number, style?: string) => void;
  triangle: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    style?: string,
  ) => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  save: (filename: string) => void;
};

type PdfConstructor = new (options: {
  orientation: "landscape";
  unit: "mm";
  format: "a4";
  compress: boolean;
}) => PdfDocument;

export function exportSolutionCsv({ classroom, solution }: ExportPlanInput) {
  const participantById = new Map(
    classroom.config.participants.map((participant) => [participant.id, participant]),
  );
  const seatById = new Map(classroom.config.room.seats.map((seat) => [seat.id, seat]));
  const resultByParticipant = new Map(
    solution.result.people.map((person) => [person.participant_id, person]),
  );

  const header = [
    "Élève",
    "Identifiant élève",
    "Place",
    "Identifiant place",
    "Satisfaction",
    "Score brut",
    "Réponse reçue",
    "Déplacé depuis le plan précédent",
    "Statut du calcul",
    "Date du calcul",
  ];

  const rows = Object.entries(solution.result.assignment)
    .map(([participantId, seatId]) => {
      const participant = participantById.get(participantId);
      const seat = seatById.get(seatId);
      const person = resultByParticipant.get(participantId);
      return [
        participant?.name ?? participantId,
        participantId,
        seat?.label ?? seatId,
        seatId,
        person?.satisfaction ?? "",
        person?.raw_score ?? "",
        person?.response_received ? "Oui" : "Non",
        person?.moved_from_previous ? "Oui" : "Non",
        solution.result.status,
        solution.result.generated_at,
      ];
    })
    .sort((a, b) => String(a[2]).localeCompare(String(b[2]), "fr", { numeric: true }));

  const csv = [header, ...rows]
    .map((row) => row.map((value) => escapeCsvCell(String(value))).join(","))
    .join("\r\n");
  downloadBlob(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    `${fileStem(classroom.name)}-${dateStamp(solution.result.generated_at)}.csv`,
  );
}

export async function exportSolutionPdf({ classroom, solution }: ExportPlanInput) {
  const module = (await import("jspdf")) as unknown as { jsPDF: PdfConstructor };
  const doc = new module.jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const sidebarWidth = 61;
  const planX = margin;
  const planY = 25;
  const planWidth = pageWidth - sidebarWidth - margin * 3;
  const planHeight = pageHeight - planY - margin;
  const sidebarX = planX + planWidth + margin;
  const room = classroom.config.room;
  const roomScale = Math.min(planWidth / room.width, planHeight / room.height);
  const renderedWidth = room.width * roomScale;
  const renderedHeight = room.height * roomScale;
  const roomX = planX + (planWidth - renderedWidth) / 2;
  const roomY = planY + (planHeight - renderedHeight) / 2;
  const participantById = new Map(
    classroom.config.participants.map((participant) => [participant.id, participant]),
  );
  const participantBySeat = new Map(
    Object.entries(solution.result.assignment).map(([participantId, seatId]) => [
      seatId,
      participantById.get(participantId),
    ]),
  );

  doc.setProperties({
    title: `Plan de classe — ${classroom.name}`,
    subject: "Plan de classe optimisé",
    author: "Plan2Classe",
    creator: "Plan2Classe",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(22, 22, 22);
  doc.text(classroom.name, margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(105, 105, 105);
  doc.text(`Plan généré le ${formatFrenchDate(solution.result.generated_at)}`, margin, 18);

  doc.setDrawColor(205, 205, 205);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(planX, planY, planWidth, planHeight, 2, 2, "FD");

  drawRoom(doc, {
    room,
    roomX,
    roomY,
    roomScale,
    participantBySeat,
  });

  drawLegend(doc, {
    x: sidebarX,
    y: planY,
    width: sidebarWidth,
    classroomName: classroom.name,
    solution,
  });

  doc.save(`${fileStem(classroom.name)}-${dateStamp(solution.result.generated_at)}.pdf`);
}

function drawRoom(
  doc: PdfDocument,
  {
    room,
    roomX,
    roomY,
    roomScale,
    participantBySeat,
  }: {
    room: PlanClassroom["config"]["room"];
    roomX: number;
    roomY: number;
    roomScale: number;
    participantBySeat: Map<
      string,
      PlanClassroom["config"]["participants"][number] | undefined
    >;
  },
) {
  const projectX = (value: number) => roomX + value * roomScale;
  const projectY = (value: number) => roomY + value * roomScale;

  doc.setLineWidth(0.35);
  doc.setDrawColor(35, 35, 35);
  const boardX = projectX(room.board.x);
  const boardY = projectY(room.board.y);
  const boardWidth = room.board.width * roomScale;
  doc.line(boardX, boardY, boardX + boardWidth, boardY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor(55, 55, 55);
  doc.text(room.board.label, boardX + boardWidth / 2, boardY + 3, { align: "center" });

  for (const furniture of room.furniture) {
    const x = projectX(furniture.x);
    const y = projectY(furniture.y);
    const width = Math.max(1.5, furniture.width * roomScale);
    const height = Math.max(1.5, furniture.height * roomScale);
    doc.setDrawColor(170, 170, 170);
    doc.setFillColor(238, 238, 238);

    if (furniture.shape === "ellipse") {
      doc.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, "FD");
    } else if (furniture.shape === "line") {
      doc.setLineWidth(Math.max(0.4, height));
      doc.line(x, y + height / 2, x + width, y + height / 2);
      doc.setLineWidth(0.35);
    } else if (furniture.shape === "polygon" && furniture.points.length >= 3) {
      const [first, second, third] = furniture.points;
      if (first && second && third) {
        doc.triangle(
          x + (first[0] / 100) * width,
          y + (first[1] / 100) * height,
          x + (second[0] / 100) * width,
          y + (second[1] / 100) * height,
          x + (third[0] / 100) * width,
          y + (third[1] / 100) * height,
          "FD",
        );
      }
    } else {
      doc.roundedRect(x, y, width, height, 1, 1, "FD");
    }
  }

  for (const seat of room.seats.filter((candidate) => candidate.enabled)) {
    const participant = participantBySeat.get(seat.id);
    const centerX = projectX(seat.x);
    const centerY = projectY(seat.y);
    const seatWidth = participant ? 19 : 9;
    const seatHeight = 8;
    const x = centerX - seatWidth / 2;
    const y = centerY - seatHeight / 2;

    if (participant) {
      doc.setFillColor(32, 32, 32);
      doc.setDrawColor(32, 32, 32);
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(145, 145, 145);
      doc.setTextColor(70, 70, 70);
    }
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, seatWidth, seatHeight, 1.2, 1.2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(participant ? 5.4 : 5);
    const primaryLabel = participant ? shortenName(participant.name, 19) : seat.label;
    doc.text(primaryLabel, centerX, centerY - (participant ? 0.3 : -0.7), { align: "center" });
    if (participant) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.2);
      doc.setTextColor(205, 205, 205);
      doc.text(seat.label, centerX, centerY + 2.3, { align: "center" });
    }
  }
}

function drawLegend(
  doc: PdfDocument,
  {
    x,
    y,
    width,
    classroomName,
    solution,
  }: {
    x: number;
    y: number;
    width: number;
    classroomName: string;
    solution: SolutionRecord;
  },
) {
  const result = solution.result;
  doc.setFillColor(248, 248, 248);
  doc.setDrawColor(210, 210, 210);
  doc.roundedRect(x, y, width, 67, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text("Résumé du calcul", x + 5, y + 8);

  const metrics = [
    ["Statut", translateStatus(result.status)],
    ["Équité minimale", formatMetric(result.min_satisfaction)],
    ["Satisfaction moyenne", formatMetric(result.average_satisfaction, 1)],
    ["Élèves placés", String(Object.keys(result.assignment).length)],
    ["Contraintes dures", result.hard_constraints_verified ? "Vérifiées" : "Non vérifiées"],
    ["Solveur", result.solver || "—"],
  ] as const;

  let cursorY = y + 16;
  for (const [label, value] of metrics) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(115, 115, 115);
    doc.text(label, x + 5, cursorY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(35, 35, 35);
    doc.text(value, x + width - 5, cursorY, { align: "right" });
    cursorY += 7.5;
  }

  const proofY = y + 72;
  doc.setFillColor(result.hard_constraints_verified ? 237 : 254, result.hard_constraints_verified ? 248 : 242, result.hard_constraints_verified ? 240 : 242);
  doc.setDrawColor(result.hard_constraints_verified ? 140 : 210, result.hard_constraints_verified ? 190 : 100, result.hard_constraints_verified ? 150 : 100);
  doc.roundedRect(x, proofY, width, 21, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(45, 45, 45);
  doc.text(result.hard_constraints_verified ? "Plan vérifié" : "Vérification requise", x + 5, proofY + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  const proofText = result.hard_constraints_verified
    ? "Toutes les contraintes déclarées comme dures sont respectées par cette solution."
    : "Certaines contraintes dures n’ont pas pu être certifiées. Consultez les diagnostics.";
  doc.text(doc.splitTextToSize(proofText, width - 10).slice(0, 2), x + 5, proofY + 12);

  const footerY = y + 101;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.setTextColor(120, 120, 120);
  doc.text(doc.splitTextToSize(classroomName, width).slice(0, 2), x, footerY);
  doc.text(`Solution ${solution.id}`, x, footerY + 10);
}

function formatMetric(value: number | null, fractionDigits = 0) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(value);
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

function shortenName(name: string, maxLength: number) {
  const normalized = name.trim();
  if (normalized.length <= maxLength) return normalized;
  const parts = normalized.split(/\s+/);
  if (parts.length > 1 && parts[0]) {
    const compact = `${parts[0]} ${parts.slice(1).map((part) => part[0]).join(".")}.`;
    if (compact.length <= maxLength) return compact;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function fileStem(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "plan-de-classe"
  );
}

function dateStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "export";
  return date.toISOString().slice(0, 10);
}

function formatFrenchDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type { ExportPlanInput, PlanClassroom };
