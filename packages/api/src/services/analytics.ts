import { desc, eq, type Database } from "@plan2classe-app/db";
import { formResponses, solutions } from "@plan2classe-app/db/schema/classroom";

import { getOwnedClassroomRow } from "./classrooms";
import { parseClassroomConfig, parseResponseRow, parseSolutionRow } from "./serialization";

export async function getOwnedAnalytics(
  database: Database,
  ownerId: string,
  classroomId: string,
) {
  const classroom = await getOwnedClassroomRow(database, ownerId, classroomId);
  const config = parseClassroomConfig(classroom.config);
  const participants = config.participants.filter((participant) => participant.active);
  const participantMap = new Map(participants.map((participant) => [participant.id, participant]));
  const seatMap = new Map(config.room.seats.map((seat) => [seat.id, seat]));
  const rows = await database
    .select()
    .from(formResponses)
    .where(eq(formResponses.classroomId, classroomId));
  const responses = rows
    .map((row) => parseResponseRow(row).response)
    .filter((response) => participantMap.has(response.participant_id));
  const responded = new Set(responses.map((response) => response.participant_id));

  const seatCounts = new Map<string, number>();
  const desiredCounts = new Map<string, number>();
  const avoidedCounts = new Map<string, number>();
  const priorityModes: Record<string, number> = {
    seat: 0,
    neighbors: 0,
    balanced: 0,
    none: 0,
  };
  const desiredEdges = new Set<string>();
  let notesCount = 0;
  for (const response of responses) {
    const firstSeat = response.seat_ranking[0];
    if (firstSeat) seatCounts.set(firstSeat, (seatCounts.get(firstSeat) ?? 0) + 1);
    for (const item of response.desired_neighbors) {
      desiredCounts.set(item.participant_id, (desiredCounts.get(item.participant_id) ?? 0) + 1);
      desiredEdges.add(`${response.participant_id}\u0000${item.participant_id}\u0000${item.relation}`);
    }
    for (const item of response.avoided_neighbors) {
      avoidedCounts.set(item.participant_id, (avoidedCounts.get(item.participant_id) ?? 0) + 1);
    }
    priorityModes[response.priority_mode] = (priorityModes[response.priority_mode] ?? 0) + 1;
    if (response.notes.trim()) notesCount += 1;
  }

  const mutualPairs: { aName: string; bName: string; relation: string }[] = [];
  const seenPairs = new Set<string>();
  for (const edge of desiredEdges) {
    const [a, b, relation] = edge.split("\u0000") as [string, string, string];
    if (!desiredEdges.has(`${b}\u0000${a}\u0000${relation}`)) continue;
    const key = [a, b].sort().join("\u0000") + `\u0000${relation}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    mutualPairs.push({
      aName: participantMap.get(a)?.name ?? a,
      bName: participantMap.get(b)?.name ?? b,
      relation,
    });
  }

  const latest = await database.query.solutions.findFirst({
    orderBy: desc(solutions.createdAt),
    where: eq(solutions.classroomId, classroomId),
  });
  const satisfactionHistogram: Record<string, number> = {
    "0-19": 0,
    "20-39": 0,
    "40-59": 0,
    "60-79": 0,
    "80-100": 0,
  };
  if (latest) {
    for (const person of parseSolutionRow(latest).result.people) {
      const percent = Math.max(0, Math.min(100, person.satisfaction / 10));
      const key =
        percent < 20
          ? "0-19"
          : percent < 40
            ? "20-39"
            : percent < 60
              ? "40-59"
              : percent < 80
                ? "60-79"
                : "80-100";
      satisfactionHistogram[key] = (satisfactionHistogram[key] ?? 0) + 1;
    }
  }

  const countedPeople = (counts: Map<string, number>) =>
    [...counts]
      .map(([participantId, count]) => ({
        participantId,
        name: participantMap.get(participantId)?.name ?? "Participant supprimé",
        count,
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "fr"));

  return {
    participantCount: participants.length,
    responseCount: responses.length,
    responseRate: participants.length === 0 ? 0 : responses.length / participants.length,
    unanswered: participants
      .filter((participant) => !responded.has(participant.id))
      .map(({ id, name }) => ({ id, name })),
    firstChoiceSeats: [...seatCounts]
      .map(([seatId, count]) => ({ seatId, label: seatMap.get(seatId)?.label ?? seatId, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "fr")),
    desiredNeighbors: countedPeople(desiredCounts),
    avoidedNeighbors: countedPeople(avoidedCounts),
    mutualPairs,
    priorityModes,
    notesCount,
    satisfactionHistogram,
  };
}
