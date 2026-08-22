from __future__ import annotations

from collections import Counter
from itertools import combinations
from typing import Any

from app.models import Handedness, ProjectSnapshot, RelationKind, RuleKind
from app.solver.geometry import RoomGeometry
from app.solver.scoring import participants_for_alternate_tag


def validate_assignment(
    snapshot: ProjectSnapshot, assignment: dict[str, str]
) -> list[dict[str, Any]]:
    """Independent post-solve checker for every implemented hard rule.

    This intentionally does not reuse CP-SAT constraints. A modelling bug should
    therefore be caught instead of being validated by the same faulty code.
    """

    participants = [person for person in snapshot.participants if person.active]
    people = {person.id: person for person in participants}
    geometry = RoomGeometry(snapshot.room)
    valid_seats = set(geometry.by_id)
    violations: list[dict[str, Any]] = []

    missing = [person.id for person in participants if person.id not in assignment]
    if missing:
        violations.append({"kind": "missing_people", "people": missing})
    unknown_people = sorted(set(assignment) - set(people))
    if unknown_people:
        violations.append({"kind": "unknown_people", "people": unknown_people})
    unknown_seats = sorted(set(assignment.values()) - valid_seats)
    if unknown_seats:
        violations.append({"kind": "unknown_seats", "seats": unknown_seats})
    counts = Counter(assignment.values())
    duplicates = sorted(seat for seat, count in counts.items() if count > 1)
    if duplicates:
        violations.append({"kind": "duplicate_seats", "seats": duplicates})
    if violations:
        return violations

    for rule in snapshot.rules:
        if not rule.enabled or not rule.hard:
            continue
        p = rule.params
        ok = True
        details: dict[str, Any] = {}
        try:
            if rule.kind == RuleKind.FIXED_SEAT:
                person_id, seat_id = str(p["participant_id"]), str(p["seat_id"])
                ok = assignment.get(person_id) == seat_id
            elif rule.kind == RuleKind.FORBIDDEN_SEATS:
                person_id = str(p["participant_id"])
                ok = assignment.get(person_id) not in set(map(str, p.get("seat_ids", [])))
            elif rule.kind == RuleKind.NO_GO:
                person_id = str(p["participant_id"])
                forbidden = set(map(str, p.get("seat_ids", [])))
                forbidden |= geometry.seats_with_tags(
                    list(map(str, p.get("tags", []))), str(p.get("mode", "any"))
                )
                ok = assignment.get(person_id) not in forbidden
            elif rule.kind in (RuleKind.REQUIRE_SEAT_TAGS, RuleKind.FORBID_SEAT_TAGS):
                person_id = str(p["participant_id"])
                seat = geometry.by_id[assignment[person_id]]
                expected = set(map(str, p.get("tags", [])))
                mode = str(p.get("mode", "any"))
                matched = expected.issubset(set(seat.tags)) if mode == "all" else bool(expected & set(seat.tags))
                ok = matched if rule.kind == RuleKind.REQUIRE_SEAT_TAGS else not matched
            elif rule.kind == RuleKind.PAIR_RELATION:
                a, b = str(p["a"]), str(p["b"])
                met = geometry.related(
                    assignment[a],
                    assignment[b],
                    str(p.get("relation", RelationKind.ADJACENT.value)),
                )
                ok = met == bool(p.get("required", True))
            elif rule.kind in (RuleKind.GROUP_SAME_TABLE, RuleKind.GROUP_DIFFERENT_TABLES):
                ids = list(map(str, p.get("participant_ids", [])))
                same = all(
                    geometry.same_table(assignment[a], assignment[b])
                    for a, b in combinations(ids, 2)
                )
                if rule.kind == RuleKind.GROUP_SAME_TABLE:
                    ok = same
                else:
                    ok = all(
                        not geometry.same_table(assignment[a], assignment[b])
                        for a, b in combinations(ids, 2)
                    )
            elif rule.kind in (RuleKind.MIN_DISTANCE, RuleKind.MAX_DISTANCE):
                a, b = str(p["a"]), str(p["b"])
                distance = geometry.distance(assignment[a], assignment[b])
                threshold = float(p.get("distance", 0))
                ok = distance >= threshold if rule.kind == RuleKind.MIN_DISTANCE else distance <= threshold
                details["actual_distance"] = distance
            elif rule.kind == RuleKind.TAG_NOT_ADJACENT:
                key = str(p.get("tag_key", "group"))
                values = set(map(str, p.get("values", [])))
                for a, b in combinations(participants, 2):
                    value = a.tags.get(key)
                    if value is None or value != b.tags.get(key) or (values and value not in values):
                        continue
                    if geometry.adjacent(assignment[a.id], assignment[b.id]):
                        ok = False
                        details.setdefault("violating_pairs", []).append([a.id, b.id])
            elif rule.kind == RuleKind.ALTERNATE_TAG:
                relation = str(p.get("relation", RelationKind.ADJACENT.value))
                ids = participants_for_alternate_tag(snapshot, rule)
                for a, b in combinations(ids, 2):
                    if geometry.related(assignment[a], assignment[b], relation):
                        ok = False
                        details.setdefault("violating_pairs", []).append([a, b])
            elif rule.kind == RuleKind.GROUP_SPREAD_TABLE:
                ids = list(map(str, p.get("participant_ids", [])))
                maximum = int(p.get("max_per_table", 1))
                table_counts: Counter[str] = Counter()
                for person_id in ids:
                    table_id = geometry.by_id[assignment[person_id]].furniture_id
                    if table_id:
                        table_counts[table_id] += 1
                over = {table: count for table, count in table_counts.items() if count > maximum}
                ok = not over
                details["over_capacity"] = over
            elif rule.kind == RuleKind.MAX_BOARD_DISTANCE:
                person_id = str(p["participant_id"])
                maximum = float(p["max_distance"])
                actual = geometry.board_distance(assignment[person_id])
                ok = actual <= maximum
                details["actual_distance"] = actual
            elif rule.kind == RuleKind.MAX_TAG_PER_TABLE:
                key = str(p.get("tag_key", "group"))
                value = str(p.get("tag_value", ""))
                maximum = int(p.get("max_count", 1))
                table_counts: Counter[str] = Counter()
                for person in participants:
                    if person.tags.get(key) != value:
                        continue
                    table = geometry.by_id[assignment[person.id]].furniture_id
                    if table:
                        table_counts[table] += 1
                over = {table: count for table, count in table_counts.items() if count > maximum}
                ok = not over
                details["over_capacity"] = over
            elif rule.kind == RuleKind.TABLE_TAG_BALANCE:
                key = str(p.get("tag_key", "group"))
                values = list(map(str, p.get("values", [])))
                if not values:
                    values = sorted({person.tags[key] for person in participants if key in person.tags})
                maximum_difference = int(p.get("max_difference", 1))
                imbalances: dict[str, dict[str, int]] = {}
                for table_id in geometry.table_ids():
                    table_counts = {value: 0 for value in values}
                    for person in participants:
                        if geometry.by_id[assignment[person.id]].furniture_id != table_id:
                            continue
                        value = person.tags.get(key)
                        if value in table_counts:
                            table_counts[value] += 1
                    if table_counts and max(table_counts.values()) - min(table_counts.values()) > maximum_difference:
                        imbalances[table_id] = table_counts
                ok = not imbalances
                details["imbalances"] = imbalances
            else:
                ok = False
                details["reason"] = "unsupported hard rule"
        except (KeyError, TypeError, ValueError) as error:
            ok = False
            details["exception"] = str(error)

        if not ok:
            violations.append(
                {
                    "kind": "hard_rule",
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "rule_kind": rule.kind.value,
                    **details,
                }
            )

    settings = snapshot.settings
    if settings.accessibility_hard and geometry.seats:
        front = geometry.front_seat_ids(settings.hard_front_fraction)
        cutoff = max((geometry.board_distance(seat_id) for seat_id in front), default=0)
        for person in participants:
            if max(person.vision_need, person.hearing_need) < 3:
                continue
            actual = geometry.board_distance(assignment[person.id])
            if actual > cutoff + 1e-9:
                violations.append(
                    {
                        "kind": "accessibility",
                        "participant_id": person.id,
                        "actual_distance": actual,
                        "max_distance": cutoff,
                    }
                )

    if settings.hand_collision == "hard":
        right_handed = [
            person
            for person in participants
            if person.handedness == Handedness.RIGHT
        ]
        left_handed = [
            person
            for person in participants
            if person.handedness == Handedness.LEFT
        ]
        for right in right_handed:
            for left in left_handed:
                if geometry.hand_conflict(
                    assignment[right.id], assignment[left.id]
                ):
                    violations.append(
                        {
                            "kind": "hand_collision",
                            "right_handed": right.id,
                            "left_handed": left.id,
                            "seats": [assignment[right.id], assignment[left.id]],
                        }
                    )

    return violations
