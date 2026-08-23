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
  output: (type: "arraybuffer") => ArrayBuffer;
  getTextWidth: (text: string) => number;
  addPage: () => PdfDocument;
  setPage: (page: number) => PdfDocument;
  getNumberOfPages: () => number;
  save: (filename: string) => void;
};

type PdfConstructor = new (options: {
  orientation: "landscape";
  unit: "mm";
  format: "a4";
  compress: boolean;
}) => PdfDocument;

/** Greyscale palette mirroring the app's neutral theme, in 0-255 components. */
const ink = {
  title: 24,
  body: 55,
  muted: 118,
  faint: 168,
  hairline: 214,
  panel: 247,
  seatBorder: 150,
  filledSeat: 32,
  onFilled: 255,
} as const;

/** UTF-8 byte order mark: Excel needs it to read accented CSV correctly. */
const BOM = String.fromCharCode(0xfeff);
/** Unicode combining marks, stripped when building an ASCII file name. */
const DIACRITICS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

const MARGIN = 12;
const HEADER_HEIGHT = 26;
const FOOTER_HEIGHT = 12;
const SIDEBAR_WIDTH = 64;

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
    new Blob([BOM, csv], { type: "text/csv;charset=utf-8" }),
    `${fileStem(classroom.name)}-${dateStamp(solution.result.generated_at)}.csv`,
  );
}

export async function exportSolutionPdf(input: ExportPlanInput) {
  const doc = await buildSolutionPdf(input);
  doc.save(
    `${fileStem(input.classroom.name)}-${dateStamp(input.solution.result.generated_at)}.pdf`,
  );
}

/** Builds the document without saving it, so the layout can be exercised in tests. */
export async function buildSolutionPdf({ classroom, solution }: ExportPlanInput) {
  const module = (await import("jspdf")) as unknown as { jsPDF: PdfConstructor };
  const doc = new module.jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const room = classroom.config.room;

  const contentTop = HEADER_HEIGHT;
  const contentBottom = pageHeight - FOOTER_HEIGHT;
  const planX = MARGIN;
  const planY = contentTop;
  const planWidth = pageWidth - SIDEBAR_WIDTH - MARGIN * 3;
  const planHeight = contentBottom - contentTop;
  const sidebarX = planX + planWidth + MARGIN;

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

  drawHeader(doc, {
    pageWidth,
    classroomName: classroom.name,
    solution,
  });

  // The room keeps its aspect ratio and is centred inside the plan panel.
  doc.setDrawColor(ink.hairline);
  doc.setFillColor(252, 252, 252);
  doc.roundedRect(planX, planY, planWidth, planHeight, 2, 2, "FD");

  const inset = 6;
  const roomScale = Math.min(
    (planWidth - inset * 2) / room.width,
    (planHeight - inset * 2) / room.height,
  );
  const roomX = planX + (planWidth - room.width * roomScale) / 2;
  const roomY = planY + (planHeight - room.height * roomScale) / 2;

  drawRoom(doc, { room, roomX, roomY, roomScale, participantBySeat });

  drawSidebar(doc, {
    x: sidebarX,
    y: planY,
    width: SIDEBAR_WIDTH,
    height: planHeight,
    solution,
    classroom,
  });

  drawSeatingList(doc, { classroom, solution, pageWidth, pageHeight });
  drawFooters(doc, { pageWidth, pageHeight, classroomName: classroom.name });

  return doc;
}

function drawHeader(
  doc: PdfDocument,
  {
    pageWidth,
    classroomName,
    solution,
  }: { pageWidth: number; classroomName: string; solution: SolutionRecord },
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(ink.title);
  const maxTitleWidth = pageWidth - MARGIN * 2 - 70;
  const [titleLine = classroomName] = doc.splitTextToSize(classroomName, maxTitleWidth);
  doc.text(titleLine, MARGIN, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(ink.muted);
  doc.text(
    `Plan de classe généré le ${formatFrenchDate(solution.result.generated_at)}`,
    MARGIN,
    18.5,
  );

  const status = translateStatus(solution.result.status);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const statusWidth = doc.getTextWidth(status) + 8;
  doc.setFillColor(ink.filledSeat);
  doc.roundedRect(pageWidth - MARGIN - statusWidth, 8, statusWidth, 7, 1.5, 1.5, "F");
  doc.setTextColor(ink.onFilled);
  doc.text(status, pageWidth - MARGIN - statusWidth / 2, 12.8, { align: "center" });

  doc.setDrawColor(ink.hairline);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, HEADER_HEIGHT - 4, pageWidth - MARGIN, HEADER_HEIGHT - 4);
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
    participantBySeat: Map<string, PlanClassroom["config"]["participants"][number] | undefined>;
  },
) {
  const projectX = (value: number) => roomX + value * roomScale;
  const projectY = (value: number) => roomY + value * roomScale;

  for (const furniture of room.furniture) {
    const x = projectX(furniture.x);
    const y = projectY(furniture.y);
    const width = Math.max(1.5, furniture.width * roomScale);
    const height = Math.max(1.5, furniture.height * roomScale);
    doc.setLineWidth(0.25);
    doc.setDrawColor(198);
    doc.setFillColor(241);

    if (furniture.shape === "ellipse") {
      doc.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, "FD");
    } else if (furniture.shape === "line") {
      doc.setLineWidth(Math.max(0.4, height));
      doc.line(x, y + height / 2, x + width, y + height / 2);
      doc.setLineWidth(0.25);
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

  // The board is drawn after the furniture so it always stays readable.
  const boardX = projectX(room.board.x);
  const boardY = projectY(room.board.y);
  const boardWidth = Math.max(10, room.board.width * roomScale);
  doc.setLineWidth(0.9);
  doc.setDrawColor(ink.filledSeat);
  doc.line(boardX, boardY, boardX + boardWidth, boardY);
  doc.setLineWidth(0.25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(ink.body);
  doc.text(room.board.label.toUpperCase(), boardX + boardWidth / 2, boardY + 3.4, {
    align: "center",
  });

  for (const seat of room.seats.filter((candidate) => candidate.enabled)) {
    const participant = participantBySeat.get(seat.id);
    const centerX = projectX(seat.x);
    const centerY = projectY(seat.y);
    const seatWidth = participant ? 21 : 10;
    const seatHeight = participant ? 9 : 7;
    const x = centerX - seatWidth / 2;
    const y = centerY - seatHeight / 2;

    if (participant) {
      doc.setFillColor(ink.filledSeat);
      doc.setDrawColor(ink.filledSeat);
    } else {
      doc.setFillColor(255);
      doc.setDrawColor(ink.seatBorder);
    }
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, seatWidth, seatHeight, 1.2, 1.2, "FD");

    if (participant) {
      doc.setTextColor(ink.onFilled);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.6);
      doc.text(shortenName(participant.name, 21), centerX, centerY - 0.3, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.2);
      doc.setTextColor(196);
      const marks = needMarks(participant);
      doc.text(marks ? `${seat.label} · ${marks}` : seat.label, centerX, centerY + 2.9, {
        align: "center",
      });
    } else {
      doc.setTextColor(ink.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      doc.text(seat.label, centerX, centerY + 0.8, { align: "center" });
    }
  }
}

function drawSidebar(
  doc: PdfDocument,
  {
    x,
    y,
    width,
    height,
    solution,
    classroom,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    solution: SolutionRecord;
    classroom: PlanClassroom;
  },
) {
  const result = solution.result;
  const placed = Object.keys(result.assignment).length;
  const seatTotal = classroom.config.room.seats.filter((seat) => seat.enabled).length;
  const answered = result.people.filter((person) => person.response_received).length;

  const metrics: ReadonlyArray<readonly [string, string]> = [
    ["Élèves placés", `${placed} / ${seatTotal}`],
    ["Réponses prises en compte", String(answered)],
    ["Équité minimale", formatMetric(result.min_satisfaction)],
    ["Satisfaction moyenne", formatMetric(result.average_satisfaction, 1)],
    ["Solveur", result.solver || "—"],
  ];

  const metricsHeight = 12 + metrics.length * 7.5;
  doc.setFillColor(ink.panel);
  doc.setDrawColor(ink.hairline);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, metricsHeight, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(ink.title);
  doc.text("Résumé du calcul", x + 5, y + 7);

  let cursorY = y + 14.5;
  for (const [label, value] of metrics) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(ink.muted);
    doc.text(label, x + 5, cursorY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ink.body);
    doc.text(value, x + width - 5, cursorY, { align: "right" });
    cursorY += 7.5;
  }

  // Proof block.
  const proofY = y + metricsHeight + 5;
  const proofHeight = 22;
  const verified = result.hard_constraints_verified;
  doc.setFillColor(verified ? 240 : 250, verified ? 246 : 240, verified ? 241 : 240);
  doc.setDrawColor(verified ? 168 : 214, verified ? 196 : 150, verified ? 176 : 150);
  doc.roundedRect(x, proofY, width, proofHeight, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(ink.body);
  doc.text(verified ? "Contraintes dures vérifiées" : "Vérification requise", x + 5, proofY + 6.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.setTextColor(ink.muted);
  const proofText = verified
    ? "Un validateur indépendant a relu l’affectation : toutes les règles déclarées comme dures sont respectées."
    : "Certaines contraintes dures n’ont pas pu être certifiées. Consultez les diagnostics dans l’application.";
  doc.text(doc.splitTextToSize(proofText, width - 10).slice(0, 3), x + 5, proofY + 11.5);

  // Legend.
  const legendY = proofY + proofHeight + 5;
  const legendItems = [
    ["G", "gaucher"],
    ["V", "besoin visuel"],
    ["A", "besoin auditif"],
    ["PMR", "accessibilité"],
  ] as const;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(ink.body);
  doc.text("Repères sur le plan", x, legendY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.setTextColor(ink.muted);
  let legendCursor = legendY + 5;
  for (const [mark, meaning] of legendItems) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ink.body);
    doc.text(mark, x, legendCursor);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ink.muted);
    doc.text(meaning, x + 9, legendCursor);
    legendCursor += 4.6;
  }
  doc.setFontSize(5.8);
  doc.text(
    doc.splitTextToSize("Une place vide reste dessinée avec son libellé.", width),
    x,
    legendCursor + 1.5,
  );

  // Anchored to the bottom of the panel so the sidebar never looks unfinished.
  doc.setFontSize(5.5);
  doc.setTextColor(ink.faint);
  doc.text(`Référence ${solution.id}`, x, y + height - 1);
}

function drawSeatingList(
  doc: PdfDocument,
  {
    classroom,
    solution,
    pageWidth,
    pageHeight,
  }: {
    classroom: PlanClassroom;
    solution: SolutionRecord;
    pageWidth: number;
    pageHeight: number;
  },
) {
  const participantById = new Map(
    classroom.config.participants.map((participant) => [participant.id, participant]),
  );
  const seatById = new Map(classroom.config.room.seats.map((seat) => [seat.id, seat]));
  const personById = new Map(
    solution.result.people.map((person) => [person.participant_id, person]),
  );

  const rows = Object.entries(solution.result.assignment)
    .map(([participantId, seatId]) => ({
      seat: seatById.get(seatId)?.label ?? seatId,
      name: participantById.get(participantId)?.name ?? participantId,
      satisfaction: personById.get(participantId)?.satisfaction ?? null,
    }))
    .sort((a, b) => a.seat.localeCompare(b.seat, "fr", { numeric: true }));

  if (rows.length === 0) return;

  doc.addPage();

  const columns = 3;
  const gutter = 6;
  const columnWidth = (pageWidth - MARGIN * 2 - gutter * (columns - 1)) / columns;
  const rowHeight = 6.2;
  const tableTop = HEADER_HEIGHT + 4;
  const usableHeight = pageHeight - FOOTER_HEIGHT - tableTop;
  const rowsPerColumn = Math.floor(usableHeight / rowHeight) - 1;
  const rowsPerPage = rowsPerColumn * columns;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(ink.title);
  doc.text("Liste des places", MARGIN, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(ink.muted);
  doc.text(
    `${rows.length} élève${rows.length > 1 ? "s" : ""} · classé par place`,
    MARGIN,
    18.5,
  );
  doc.setDrawColor(ink.hairline);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, HEADER_HEIGHT - 4, pageWidth - MARGIN, HEADER_HEIGHT - 4);

  rows.forEach((row, index) => {
    const positionInPage = index % rowsPerPage;
    if (index > 0 && positionInPage === 0) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(ink.title);
      doc.text("Liste des places (suite)", MARGIN, 13);
      doc.setDrawColor(ink.hairline);
      doc.line(MARGIN, HEADER_HEIGHT - 4, pageWidth - MARGIN, HEADER_HEIGHT - 4);
    }

    const column = Math.floor(positionInPage / rowsPerColumn);
    const line = positionInPage % rowsPerColumn;
    const x = MARGIN + column * (columnWidth + gutter);
    const y = tableTop + line * rowHeight;

    if (line % 2 === 1) {
      doc.setFillColor(249);
      doc.rect(x, y - 4, columnWidth, rowHeight, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(ink.body);
    doc.text(row.seat, x + 2, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(ink.title);
    const nameWidth = columnWidth - 26;
    const [nameLine = row.name] = doc.splitTextToSize(row.name, nameWidth);
    doc.text(nameLine, x + 14, y);

    doc.setTextColor(ink.muted);
    doc.setFontSize(6.5);
    doc.text(
      row.satisfaction === null ? "—" : `${row.satisfaction}`,
      x + columnWidth - 2,
      y,
      { align: "right" },
    );
  });
}

function drawFooters(
  doc: PdfDocument,
  {
    pageWidth,
    pageHeight,
    classroomName,
  }: { pageWidth: number; pageHeight: number; classroomName: string },
) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(ink.hairline);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageHeight - FOOTER_HEIGHT + 3, pageWidth - MARGIN, pageHeight - FOOTER_HEIGHT + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(ink.faint);
    const [footerName = classroomName] = doc.splitTextToSize(classroomName, pageWidth / 2);
    doc.text(`Plan2Classe · ${footerName}`, MARGIN, pageHeight - FOOTER_HEIGHT + 7.5);
    doc.text(`${page} / ${total}`, pageWidth - MARGIN, pageHeight - FOOTER_HEIGHT + 7.5, {
      align: "right",
    });
  }
}

function needMarks(participant: PlanClassroom["config"]["participants"][number]) {
  const marks: string[] = [];
  if (participant.handedness === "left") marks.push("G");
  if (participant.vision_need > 0) marks.push("V");
  if (participant.hearing_need > 0) marks.push("A");
  if (participant.tags.accessible === "true") marks.push("PMR");
  return marks.join(" ");
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
    const compact = `${parts[0]} ${parts
      .slice(1)
      .map((part) => part[0])
      .join(".")}.`;
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
      .replace(DIACRITICS, "")
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
