from __future__ import annotations

from itertools import permutations

from app.models import (
    Board,
    Furniture,
    Participant,
    PreferenceResponse,
    ProjectSnapshot,
    RelationKind,
    Room,
    Seat,
    SeatRelation,
    SolverSettings,
)
from app.solver.geometry import RoomGeometry
from app.solver.scoring import build_scoring_plan


def make_room(seat_count: int = 4) -> Room:
    furniture = []
    seats = []
    relations = []
    for pair in range((seat_count + 1) // 2):
        table_id = f"t{pair + 1}"
        x = 120 + pair * 240
        furniture.append(
            Furniture(id=table_id, label=f"Table {pair + 1}", x=x, y=220, width=160, height=70)
        )
        ids = []
        for side in range(2):
            index = pair * 2 + side
            if index >= seat_count:
                continue
            seat_id = f"s{index + 1}"
            ids.append(seat_id)
            seats.append(
                Seat(
                    id=seat_id,
                    label=f"S{index + 1}",
                    x=x + 45 + side * 70,
                    y=315,
                    furniture_id=table_id,
                    tags=["front" if pair == 0 else "back", "left" if side == 0 else "right"],
                    side="left" if side == 0 else "right",
                )
            )
        if len(ids) == 2:
            relations.append(
                SeatRelation(a=ids[0], b=ids[1], kinds=[RelationKind.ADJACENT, RelationKind.NEAR])
            )
    return Room(
        width=900,
        height=600,
        board=Board(x=300, y=30, width=300),
        furniture=furniture,
        seats=seats,
        relations=relations,
        near_threshold=130,
        infer_adjacent_threshold=90,
    )


def make_snapshot(person_count: int = 4, seat_count: int | None = None) -> ProjectSnapshot:
    seat_count = person_count if seat_count is None else seat_count
    return ProjectSnapshot(
        id="test_project",
        name="Test",
        slug="test",
        admin_token="secret",
        room=make_room(seat_count),
        participants=[Participant(id=f"p{i+1}", name=f"Person {i+1}") for i in range(person_count)],
        settings=SolverSettings(
            time_limit_seconds=4,
            num_workers=1,
            random_seed=42,
            deterministic_tiebreak=True,
            stability_enabled=True,
        ),
    )


def latest_responses(snapshot: ProjectSnapshot):
    result = {}
    for response in snapshot.responses:
        result[response.participant_id] = response
    return result


def evaluate_assignment(snapshot: ProjectSnapshot, assignment: dict[str, str]) -> tuple[int, int]:
    geometry = RoomGeometry(snapshot.room)
    scoring = build_scoring_plan(snapshot, geometry)
    person_ids = [person.id for person in snapshot.participants if person.active]
    seat_ids = [seat.id for seat in geometry.seats]
    raw = {person_id: 0 for person_id in person_ids}
    unary_totals = {person_id: {seat_id: 0 for seat_id in seat_ids} for person_id in person_ids}
    pair_coefficients = {person_id: [] for person_id in person_ids}

    for term in scoring.unary:
        if term.person_id not in raw or term.seat_id not in geometry.by_id:
            continue
        unary_totals[term.person_id][term.seat_id] += term.coefficient
        if assignment[term.person_id] == term.seat_id:
            raw[term.person_id] += term.coefficient

    for term in scoring.pair:
        if term.person_a not in raw or term.person_b not in raw:
            continue
        met = term.condition.matches(
            geometry, assignment[term.person_a], assignment[term.person_b]
        )
        for beneficiary in term.beneficiaries:
            pair_coefficients[beneficiary].append(term.coefficient)
            if met:
                raw[beneficiary] += term.coefficient

    norms = {}
    for person_id in person_ids:
        seat_values = list(unary_totals[person_id].values())
        lower = min(seat_values, default=0) + sum(
            value for value in pair_coefficients[person_id] if value < 0
        )
        upper = max(seat_values, default=0) + sum(
            value for value in pair_coefficients[person_id] if value > 0
        )
        if upper == lower:
            norms[person_id] = 1000
        else:
            norms[person_id] = (1000 * (raw[person_id] - lower)) // (upper - lower)
    fairness_people = [
        person_id
        for person_id in person_ids
        if any(unary_totals[person_id].values()) or pair_coefficients[person_id]
    ]
    minimum = min((norms[person_id] for person_id in fairness_people), default=1000)
    total = sum(scoring.person_weights[person_id] * norms[person_id] for person_id in person_ids)
    return minimum, total


def brute_force_optimum(snapshot: ProjectSnapshot) -> tuple[tuple[int, int], list[dict[str, str]]]:
    people = [person.id for person in snapshot.participants if person.active]
    seats = [seat.id for seat in snapshot.room.seats if seat.enabled]
    best = (-1, -1)
    assignments = []
    for chosen in permutations(seats, len(people)):
        assignment = dict(zip(people, chosen, strict=True))
        value = evaluate_assignment(snapshot, assignment)
        if value > best:
            best = value
            assignments = [assignment]
        elif value == best:
            assignments.append(assignment)
    return best, assignments

