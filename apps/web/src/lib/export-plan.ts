import type { Classroom, Room, Seat, SolutionRecord } from "@plan2classe-app/api/schemas/classroom";

type PlanClassroom = Pick<Classroom, "name" | "config">;
type PlanParticipant = PlanClassroom["config"]["participants"][number];

type ExportPlanInput = {
  classroom: PlanClassroom;
  solution: SolutionRecord;
};

type PdfDocument = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
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
  splitTextToSize: (text: string, maxWidth: number) => string[];
  output: (type: "arraybuffer") => ArrayBuffer;
  getTextWidth: (text: string) => number;
  save: (filename: string) => void;
};

type PdfConstructor = new (options: {
  orientation: "landscape";
  unit: "mm";
  format: "a4";
  compress: boolean;
}) => PdfDocument;

/** Print greys, in 0-255 components. */
const ink = {
  title: 20,
  body: 60,
  muted: 125,
  rule: 205,
  cellBorder: 70,
  fill: 244,
} as const;

/** UTF-8 byte order mark: Excel needs it to read accented CSV correctly. */
const BOM = String.fromCharCode(0xfeff);
/** Unicode combining marks, stripped when building an ASCII file name. */
const DIACRITICS = new RegExp(
  "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]",
  "g",
);

const MARGIN = 14;
/** Seats closer than this share a row, as a fraction of the room height. */
const ROW_BAND = 0.06;

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

type SeatBlock = { seats: Seat[] };
type SeatRow = { blocks: SeatBlock[] };

/**
 * Turns the free-form plan into the row-and-table grid a printed seating chart
 * is expected to be: seats are banded into rows by their vertical position,
 * ordered left to right, and consecutive seats sharing a table stay welded.
 */
function buildGrid(room: Room): SeatRow[] {
  const seats = room.seats.filter((seat) => seat.enabled).sort((a, b) => a.y - b.y || a.x - b.x);
  if (seats.length === 0) return [];

  const band = Math.max(1, room.height * ROW_BAND);
  const rows: Seat[][] = [];
  for (const seat of seats) {
    const current = rows[rows.length - 1];
    const reference = current?.[0];
    if (current && reference && Math.abs(seat.y - reference.y) <= band) current.push(seat);
    else rows.push([seat]);
  }

  return rows.map((row) => {
    const ordered = [...row].sort((a, b) => a.x - b.x);
    const blocks: SeatBlock[] = [];
    for (const seat of ordered) {
      const last = blocks[blocks.length - 1];
      const lastSeat = last?.seats[last.seats.length - 1];
      const sameTable =
        lastSeat && seat.furniture_id !== null && lastSeat.furniture_id === seat.furniture_id;
      if (last && sameTable) last.seats.push(seat);
      else blocks.push({ seats: [seat] });
    }
    return { blocks };
  });
}

function schoolYearFor(room: Room, date: Date) {
  const declared = room.metadata?.schoolYear;
  if (typeof declared === "string" && declared.trim()) return declared.trim();
  // A school year starts in the late summer, so anything before August still
  // belongs to the year that began the previous calendar year.
  const year = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}–${year + 1}`;
}

function roomNumberFor(room: Room) {
  const declared = room.metadata?.roomNumber;
  return typeof declared === "string" && declared.trim() ? declared.trim() : null;
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
  const generatedAt = new Date(solution.result.generated_at);

  const participantById = new Map(
    classroom.config.participants.map((participant) => [participant.id, participant]),
  );
  const participantBySeat = new Map<string, PlanParticipant | undefined>(
    Object.entries(solution.result.assignment).map(([participantId, seatId]) => [
      seatId,
      participantById.get(participantId),
    ]),
  );

  doc.setProperties({
    title: `Plan de classe — ${classroom.name}`,
    subject: "Plan de classe",
    author: "Plan2Classe",
    creator: "Plan2Classe",
  });

  // ---- Header -------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(ink.title);
  const [title = classroom.name] = doc.splitTextToSize(classroom.name, pageWidth - MARGIN * 2);
  doc.text(title, MARGIN, MARGIN + 3);

  const roomNumber = roomNumberFor(room);
  const meta = [
    `Année scolaire ${schoolYearFor(room, generatedAt)}`,
    roomNumber ? `Salle ${roomNumber}` : null,
    formatLongDate(generatedAt),
  ].filter(Boolean) as string[];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(ink.muted);
  doc.text(meta.join("   ·   "), MARGIN, MARGIN + 9);

  doc.setDrawColor(ink.rule);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, MARGIN + 13, pageWidth - MARGIN, MARGIN + 13);

  // ---- Plan area ----------------------------------------------------------
  const sideLabelWidth = 8;
  const planTop = MARGIN + 20;
  const planBottom = pageHeight - MARGIN - 6;
  const planLeft = MARGIN + sideLabelWidth;
  const planRight = pageWidth - MARGIN - sideLabelWidth;
  const planWidth = planRight - planLeft;

  const rows = buildGrid(room);
  const maxCells = Math.max(1, ...rows.map((row) => row.blocks.reduce((n, b) => n + b.seats.length, 0)));
  const maxBlocks = Math.max(1, ...rows.map((row) => row.blocks.length));

  // Board first: it anchors the top of the plan and the rows flow beneath it.
  const boardWidth = Math.min(planWidth * 0.46, 120);
  const boardHeight = 9;
  const boardX = planLeft + (planWidth - boardWidth) / 2;
  doc.setDrawColor(ink.cellBorder);
  doc.setFillColor(ink.fill);
  doc.setLineWidth(0.4);
  doc.roundedRect(boardX, planTop, boardWidth, boardHeight, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(ink.body);
  doc.text(room.board.label.toUpperCase(), planLeft + planWidth / 2, planTop + 5.9, {
    align: "center",
  });

  const gridTop = planTop + boardHeight + 12;
  const gridHeight = planBottom - gridTop;
  const rowGap = 4;
  const blockGap = 6;
  const rowHeight = Math.min(
    18,
    Math.max(9, (gridHeight - rowGap * Math.max(0, rows.length - 1)) / Math.max(1, rows.length)),
  );
  const cellWidth = Math.min(
    46,
    (planWidth - blockGap * (maxBlocks - 1)) / maxCells,
  );

  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(ink.muted);
    doc.text("Aucune place active dans cette salle.", planLeft + planWidth / 2, gridTop + 20, {
      align: "center",
    });
  }

  rows.forEach((row, rowIndex) => {
    const cells = row.blocks.reduce((total, block) => total + block.seats.length, 0);
    const rowWidth = cells * cellWidth + (row.blocks.length - 1) * blockGap;
    let x = planLeft + (planWidth - rowWidth) / 2;
    const y = gridTop + rowIndex * (rowHeight + rowGap);

    for (const block of row.blocks) {
      const blockWidth = block.seats.length * cellWidth;
      doc.setDrawColor(ink.cellBorder);
      doc.setLineWidth(0.4);
      doc.rect(x, y, blockWidth, rowHeight, "S");

      block.seats.forEach((seat, seatIndex) => {
        const cellX = x + seatIndex * cellWidth;
        if (seatIndex > 0) {
          doc.setLineWidth(0.25);
          doc.line(cellX, y, cellX, y + rowHeight);
        }
        const participant = participantBySeat.get(seat.id);
        const centerX = cellX + cellWidth / 2;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(rowHeight > 13 ? 9 : 7.5);
        doc.setTextColor(participant ? ink.title : ink.muted);
        const label = participant ? shortenName(participant.name, 24) : "—";
        doc.text(label, centerX, y + rowHeight / 2 + 0.4, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.6);
        doc.setTextColor(ink.muted);
        doc.text(seat.label, cellX + 1.6, y + rowHeight - 1.8);
      });

      x += blockWidth + blockGap;
    }
  });

  // ---- Side orientation labels -------------------------------------------
  const sideLabels = orientationLabels(room);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(ink.muted);
  const sideY = gridTop + Math.max(0, gridHeight) / 2;
  if (sideLabels.left) {
    doc.text(sideLabels.left, MARGIN + 3, sideY, { align: "center", angle: 90 });
  }
  if (sideLabels.right) {
    doc.text(sideLabels.right, pageWidth - MARGIN - 3, sideY, { align: "center", angle: 270 });
  }

  // ---- Footer -------------------------------------------------------------
  doc.setFontSize(6.5);
  doc.setTextColor(ink.rule);
  doc.text("Plan2Classe", pageWidth - MARGIN, pageHeight - MARGIN + 3, { align: "right" });

  return doc;
}

function orientationLabels(room: Room) {
  const wall = room.metadata?.wall;
  const windowSide = room.metadata?.window;
  const left = wall === "left" ? "côté mur" : windowSide === "left" ? "côté fenêtre" : null;
  const right = windowSide === "right" ? "côté fenêtre" : wall === "right" ? "côté mur" : null;
  return { left, right };
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

function formatLongDate(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
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
