import type { Classroom, Room, SolutionRecord } from "@plan2classe-app/api/schemas/classroom";

type PlanClassroom = Pick<Classroom, "name" | "config">;
type PlanParticipant = PlanClassroom["config"]["participants"][number];

type ExportPlanInput = {
  classroom: PlanClassroom;
  solution: SolutionRecord;
};

export type PdfExportOptions = {
  /** Heading of the document, e.g. "Plan de classe". */
  title: string;
  /** Sub-heading, normally the class name. */
  subtitle: string;
  roomName: string;
  schoolYear: string;
  orientation: "landscape" | "portrait";
  /** `filled` inverts occupied seats, `outline` keeps everything on white. */
  style: "outline" | "filled";
  showSeatLabels: boolean;
  showNeeds: boolean;
  includeStudentList: boolean;
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
  ellipse: (x: number, y: number, rx: number, ry: number, style?: string) => void;
  lines: (
    points: number[][],
    x: number,
    y: number,
    scale?: number[],
    style?: string,
    closed?: boolean,
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
  orientation: "landscape" | "portrait";
  unit: "mm";
  format: "a4";
  compress: boolean;
}) => PdfDocument;

/** Print greys, in 0-255 components. */
const ink = {
  title: 20,
  body: 60,
  muted: 130,
  rule: 208,
  furnitureLine: 190,
  furnitureFill: 243,
  seatLine: 90,
  seatFillDark: 34,
  onDark: 255,
} as const;

/** UTF-8 byte order mark: Excel needs it to read accented CSV correctly. */
const BOM = String.fromCharCode(0xfeff);
/** Unicode combining marks, stripped when building an ASCII file name. */
const DIACRITICS = new RegExp(
  "[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]",
  "g",
);

const MARGIN = 14;
const HEADER_HEIGHT = 22;
const FOOTER_HEIGHT = 10;
/** Font sizes tried, largest first, when fitting a name into its seat. */
const NAME_SIZES = [8.5, 7.5, 6.5, 5.8, 5.2, 4.6] as const;

export function defaultSchoolYear(date = new Date()) {
  // A school year starts in the late summer, so anything before August still
  // belongs to the year that began the previous calendar year.
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}–${start + 1}`;
}

export function defaultExportOptions(
  classroom: PlanClassroom,
  generatedAt: Date,
): PdfExportOptions {
  const metadata = classroom.config.room.metadata ?? {};
  const roomName = typeof metadata.roomNumber === "string" ? metadata.roomNumber : "";
  const schoolYear = typeof metadata.schoolYear === "string" ? metadata.schoolYear : "";
  return {
    title: "Plan de classe",
    subtitle: classroom.name,
    roomName,
    schoolYear: schoolYear || defaultSchoolYear(generatedAt),
    orientation: "landscape",
    style: "filled",
    showSeatLabels: true,
    showNeeds: false,
    includeStudentList: false,
  };
}

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

export async function exportSolutionPdf(input: ExportPlanInput, options?: PdfExportOptions) {
  const doc = await buildSolutionPdf(input, options);
  doc.save(
    `${fileStem(options?.subtitle || input.classroom.name)}-${dateStamp(
      input.solution.result.generated_at,
    )}.pdf`,
  );
}

/**
 * Median distance from a seat to its closest neighbour, in room units. It sets
 * how much space a seat box may take without colliding with the next one.
 */
function seatPitch(room: Room) {
  const seats = room.seats.filter((seat) => seat.enabled);
  if (seats.length < 2) return 120;
  const distances = seats.map((seat) => {
    let best = Number.POSITIVE_INFINITY;
    for (const other of seats) {
      if (other.id === seat.id) continue;
      const distance = Math.hypot(other.x - seat.x, other.y - seat.y);
      if (distance < best) best = distance;
    }
    return best;
  });
  distances.sort((a, b) => a - b);
  return distances[Math.floor(distances.length / 2)] ?? 120;
}

/**
 * Greedy wrap that can also break after a hyphen: composed first names are one
 * whitespace-free token, so a space-only split would leave them overflowing.
 */
function wrapName(doc: PdfDocument, name: string, maxWidth: number) {
  const tokens = name.trim().split(/(?<=[-\s])/);
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const candidate = current + token;
    if (!current || doc.getTextWidth(candidate.trim()) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current.trim());
      current = token;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

/** Cuts a line that still cannot fit, keeping an ellipsis as the last glyph. */
function ellipsize(doc: PdfDocument, line: string, maxWidth: number) {
  if (doc.getTextWidth(line) <= maxWidth) return line;
  let text = line;
  while (text.length > 1 && doc.getTextWidth(`${text}…`) > maxWidth) {
    text = text.slice(0, -1);
  }
  return `${text}…`;
}

/** "Marie-Charlotte Delaunay-Fontaine" becomes "Marie-Charlotte D.-F.". */
function abbreviate(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const [first, ...rest] = parts;
  const initials = rest
    .map((part) =>
      part
        .split("-")
        .map((piece) => (piece[0] ? `${piece[0].toLocaleUpperCase("fr")}.` : ""))
        .join("-"),
    )
    .join(" ");
  return `${first} ${initials}`.trim();
}

/**
 * Largest font size at which the name fits the box on at most `maxLines`. A
 * name too long even wrapped is abbreviated rather than silently cut, so the
 * chart never shows a half word.
 */
function fitName(doc: PdfDocument, name: string, maxWidth: number, maxLines: number) {
  const candidates = [name, abbreviate(name)].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  for (const candidate of candidates) {
    for (const size of NAME_SIZES) {
      doc.setFontSize(size);
      const lines = wrapName(doc, candidate, maxWidth);
      if (lines.length <= maxLines && lines.every((line) => doc.getTextWidth(line) <= maxWidth)) {
        return { size, lines };
      }
    }
  }
  const size = NAME_SIZES[NAME_SIZES.length - 1]!;
  doc.setFontSize(size);
  const wrapped = wrapName(doc, candidates[candidates.length - 1]!, maxWidth);
  const lines = wrapped.slice(0, maxLines).map((line, index) => {
    const isLastShown = index === Math.min(maxLines, wrapped.length) - 1;
    const truncated = wrapped.length > maxLines && isLastShown;
    return ellipsize(doc, truncated ? `${line}…` : line, maxWidth);
  });
  return { size, lines };
}

function needMarks(participant: PlanParticipant) {
  const marks: string[] = [];
  if (participant.handedness === "left") marks.push("G");
  if (participant.vision_need > 0) marks.push("V");
  if (participant.hearing_need > 0) marks.push("A");
  if (participant.tags.accessible === "true") marks.push("PMR");
  return marks.join(" ");
}

/** Builds the document without saving it, so the layout can be exercised in tests. */
export async function buildSolutionPdf(
  { classroom, solution }: ExportPlanInput,
  optionsInput?: PdfExportOptions,
) {
  const generatedAt = new Date(solution.result.generated_at);
  const options = optionsInput ?? defaultExportOptions(classroom, generatedAt);

  const module = (await import("jspdf")) as unknown as { jsPDF: PdfConstructor };
  const doc = new module.jsPDF({
    orientation: options.orientation,
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const room = classroom.config.room;

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
    title: `${options.title} — ${options.subtitle}`,
    subject: options.title,
    author: "Plan2Classe",
    creator: "Plan2Classe",
  });

  drawHeader(doc, { pageWidth, options, generatedAt });

  // ---- Plan area, sized so the room keeps its aspect ratio ----------------
  const planTop = HEADER_HEIGHT + 6;
  const planBottom = pageHeight - FOOTER_HEIGHT;
  const planLeft = MARGIN;
  const planWidth = pageWidth - MARGIN * 2;
  const planHeight = planBottom - planTop;

  const scale = Math.min(planWidth / room.width, planHeight / room.height);
  const originX = planLeft + (planWidth - room.width * scale) / 2;
  const originY = planTop + (planHeight - room.height * scale) / 2;
  const projectX = (value: number) => originX + value * scale;
  const projectY = (value: number) => originY + value * scale;

  const pitch = seatPitch(room);
  const seatWidth = Math.min(34, Math.max(13, pitch * scale * 0.94));
  // Tall enough for two wrapped lines plus the label strip; rows sit much
  // further apart than seats within a table, so height is the cheap axis.
  const seatHeight = Math.min(18, Math.max(8, seatWidth * 0.66));

  // Furniture, then the board, then seats: later layers stay readable.
  for (const item of room.furniture) {
    const x = projectX(item.x);
    const y = projectY(item.y);
    const width = Math.max(1.5, item.width * scale);
    const height = Math.max(1.5, item.height * scale);
    doc.setDrawColor(ink.furnitureLine);
    doc.setFillColor(ink.furnitureFill);
    doc.setLineWidth(0.3);

    if (item.shape === "ellipse") {
      doc.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, "FD");
    } else if (item.shape === "line") {
      doc.setLineWidth(Math.max(0.5, height));
      doc.setDrawColor(ink.seatLine);
      doc.line(x, y + height / 2, x + width, y + height / 2);
    } else if (item.shape === "polygon" && item.points.length >= 3) {
      // `points` are percentages of the bounding box, as the on-screen
      // `clip-path` expects; jsPDF wants deltas from the first vertex.
      const absolute = item.points.map(
        ([px, py]) => [x + (px / 100) * width, y + (py / 100) * height] as const,
      );
      const first = absolute[0]!;
      const deltas = absolute
        .slice(1)
        .map((point, index) => [
          point[0] - (absolute[index] ?? first)[0],
          point[1] - (absolute[index] ?? first)[1],
        ]);
      doc.lines(deltas, first[0], first[1], [1, 1], "FD", true);
    } else if (item.shape === "composite") {
      // A U keeps only its two arms and the back, so the inside stays open.
      const arm = Math.max(1.5, width * 0.14);
      const back = Math.max(1.5, height * 0.22);
      doc.rect(x, y, arm, height, "FD");
      doc.rect(x + width - arm, y, arm, height, "FD");
      doc.rect(x, y + height - back, width, back, "FD");
    } else {
      doc.roundedRect(x, y, width, height, 1, 1, "FD");
    }

    if (item.shape !== "line" && width > 16 && height > 6) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.4);
      doc.setTextColor(ink.muted);
      const [label = ""] = doc.splitTextToSize(item.label, width - 3);
      doc.text(label, x + width / 2, y + height / 2 + 1, { align: "center" });
    }
  }

  const boardX = projectX(room.board.x);
  const boardY = projectY(room.board.y);
  const boardWidth = Math.max(12, room.board.width * scale);
  doc.setDrawColor(ink.title);
  doc.setLineWidth(0.9);
  doc.line(boardX, boardY, boardX + boardWidth, boardY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(ink.body);
  doc.text(room.board.label.toUpperCase(), boardX + boardWidth / 2, boardY - 1.8, {
    align: "center",
  });

  for (const seat of room.seats) {
    if (!seat.enabled) continue;
    const participant = participantBySeat.get(seat.id);
    const centerX = projectX(seat.x);
    const centerY = projectY(seat.y);
    const x = centerX - seatWidth / 2;
    const y = centerY - seatHeight / 2;
    const filled = Boolean(participant) && options.style === "filled";

    doc.setLineWidth(0.3);
    doc.setDrawColor(filled ? ink.seatFillDark : ink.seatLine);
    doc.setFillColor(filled ? ink.seatFillDark : 255);
    doc.roundedRect(x, y, seatWidth, seatHeight, 1.1, 1.1, "FD");

    const labelRoom = options.showSeatLabels ? 2.4 : 0;
    const textAreaHeight = seatHeight - labelRoom;
    const maxLines = textAreaHeight >= 5 ? 2 : 1;

    if (participant) {
      doc.setFont("helvetica", "bold");
      const { size, lines } = fitName(doc, participant.name, seatWidth - 2.4, maxLines);
      doc.setFontSize(size);
      doc.setTextColor(filled ? ink.onDark : ink.title);
      const lineHeight = size * 0.36;
      const blockTop = y + textAreaHeight / 2 - ((lines.length - 1) * lineHeight) / 2 + size * 0.13;
      lines.forEach((line, index) => {
        doc.text(line, centerX, blockTop + index * lineHeight, { align: "center" });
      });
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.4);
      doc.setTextColor(ink.muted);
      doc.text("libre", centerX, y + textAreaHeight / 2 + 0.8, { align: "center" });
    }

    const marks = participant && options.showNeeds ? needMarks(participant) : "";
    if (options.showSeatLabels || marks) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.6);
      doc.setTextColor(filled ? 200 : ink.muted);
      if (options.showSeatLabels) {
        doc.text(seat.label, x + 1.4, y + seatHeight - 1.3);
      }
      if (marks) {
        doc.text(marks, x + seatWidth - 1.4, y + seatHeight - 1.3, { align: "right" });
      }
    }
  }

  if (options.includeStudentList) {
    drawStudentList(doc, { classroom, solution, pageWidth, pageHeight, options });
  }
  drawFooters(doc, { pageWidth, pageHeight, options });

  return doc;
}

function drawHeader(
  doc: PdfDocument,
  {
    pageWidth,
    options,
    generatedAt,
  }: { pageWidth: number; options: PdfExportOptions; generatedAt: Date },
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(ink.title);
  const [title = options.title] = doc.splitTextToSize(options.title, pageWidth - MARGIN * 2);
  doc.text(title, MARGIN, MARGIN);

  const meta = [options.subtitle, options.roomName ? `Salle ${options.roomName}` : null]
    .filter(Boolean)
    .join("   ·   ");
  if (meta) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(ink.body);
    doc.text(meta, MARGIN, MARGIN + 5.5);
  }

  const right = [options.schoolYear, formatLongDate(generatedAt)].filter(Boolean).join("   ·   ");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(ink.muted);
  doc.text(right, pageWidth - MARGIN, MARGIN, { align: "right" });

  doc.setDrawColor(ink.rule);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, HEADER_HEIGHT, pageWidth - MARGIN, HEADER_HEIGHT);
}

function drawStudentList(
  doc: PdfDocument,
  {
    classroom,
    solution,
    pageWidth,
    pageHeight,
    options,
  }: {
    classroom: PlanClassroom;
    solution: SolutionRecord;
    pageWidth: number;
    pageHeight: number;
    options: PdfExportOptions;
  },
) {
  const participantById = new Map(
    classroom.config.participants.map((participant) => [participant.id, participant]),
  );
  const seatById = new Map(classroom.config.room.seats.map((seat) => [seat.id, seat]));

  const rows = Object.entries(solution.result.assignment)
    .map(([participantId, seatId]) => ({
      seat: seatById.get(seatId)?.label ?? seatId,
      name: participantById.get(participantId)?.name ?? participantId,
    }))
    .sort((a, b) => a.seat.localeCompare(b.seat, "fr", { numeric: true }));
  if (rows.length === 0) return;

  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(ink.title);
  doc.text("Liste des élèves", MARGIN, MARGIN);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(ink.muted);
  doc.text(
    [options.subtitle, `${rows.length} élèves`].filter(Boolean).join("   ·   "),
    MARGIN,
    MARGIN + 5.5,
  );
  doc.setDrawColor(ink.rule);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, HEADER_HEIGHT, pageWidth - MARGIN, HEADER_HEIGHT);

  const columns = pageWidth > pageHeight ? 3 : 2;
  const gutter = 8;
  const columnWidth = (pageWidth - MARGIN * 2 - gutter * (columns - 1)) / columns;
  const rowHeight = 6.4;
  const top = HEADER_HEIGHT + 8;
  const perColumn = Math.max(1, Math.floor((pageHeight - FOOTER_HEIGHT - top) / rowHeight));
  const perPage = perColumn * columns;

  rows.forEach((row, index) => {
    const position = index % perPage;
    if (index > 0 && position === 0) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(ink.title);
      doc.text("Liste des élèves (suite)", MARGIN, MARGIN);
      doc.setDrawColor(ink.rule);
      doc.line(MARGIN, HEADER_HEIGHT, pageWidth - MARGIN, HEADER_HEIGHT);
    }
    const column = Math.floor(position / perColumn);
    const line = position % perColumn;
    const x = MARGIN + column * (columnWidth + gutter);
    const y = top + line * rowHeight;

    if (line % 2 === 1) {
      doc.setFillColor(249);
      doc.rect(x, y - 4.4, columnWidth, rowHeight, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(ink.body);
    doc.text(row.seat, x + 2, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ink.title);
    const [name = row.name] = doc.splitTextToSize(row.name, columnWidth - 18);
    doc.text(name, x + 15, y);
  });
}

function drawFooters(
  doc: PdfDocument,
  {
    pageWidth,
    pageHeight,
    options,
  }: { pageWidth: number; pageHeight: number; options: PdfExportOptions },
) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(ink.rule);
    doc.text(options.subtitle, MARGIN, pageHeight - 5);
    if (total > 1) {
      doc.text(`${page} / ${total}`, pageWidth - MARGIN, pageHeight - 5, { align: "right" });
    }
  }
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
