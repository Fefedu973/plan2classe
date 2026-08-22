from __future__ import annotations

from collections import defaultdict

import pytest
import app.solver.engine as engine_module

from app.models import (
    Board,
    Handedness,
    Participant,
    RelationKind,
    Room,
    Rule,
    RuleKind,
    Seat,
    SeatRelation,
)
from app.solver import SeatingOptimizer
from app.solver.geometry import RoomGeometry
from app.solver.validation import validate_assignment
from tests.helpers import make_snapshot


CANONICAL_RULE_KINDS = {
    "fixed_seat",
    "forbidden_seats",
    "require_seat_tags",
    "forbid_seat_tags",
    "pair_relation",
    "group_same_table",
    "group_different_tables",
    "min_distance",
    "max_distance",
    "tag_not_adjacent",
    "max_tag_per_table",
    "table_tag_balance",
}


def test_canonical_rule_kind_contract_is_preserved() -> None:
    assert CANONICAL_RULE_KINDS <= {kind.value for kind in RuleKind}


def test_extension_params_and_handedness_are_typed_and_normalized() -> None:
    rule = Rule(
        name="Zones interdites",
        kind=RuleKind.NO_GO,
        params={"participant": "p1", "seats": ["s1"], "seat_tags": ["front"]},
    )
    assert rule.params == {
        "participant_id": "p1",
        "seat_ids": ["s1"],
        "tags": ["front"],
        "mode": "any",
    }
    assert Participant(name="D", handedness="R").handedness == Handedness.RIGHT
    assert Participant(name="G", handedness="gauchère").handedness == Handedness.LEFT


def test_group_spread_table_limits_each_table() -> None:
    snapshot = make_snapshot(person_count=2, seat_count=4)
    snapshot.rules = [
        Rule(
            id="spread",
            name="Répartir le groupe",
            kind=RuleKind.GROUP_SPREAD_TABLE,
            params={"participants": ["p1", "p2"], "max_per_table": 1},
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    geometry = RoomGeometry(snapshot.room)
    assert result.status == "optimal"
    assert not geometry.same_table(result.assignment["p1"], result.assignment["p2"])
    assert validate_assignment(snapshot, result.assignment) == []


def test_no_go_combines_explicit_seats_and_tags() -> None:
    snapshot = make_snapshot(person_count=1, seat_count=4)
    snapshot.rules = [
        Rule(
            name="Pas devant ni en S3",
            kind=RuleKind.NO_GO,
            params={
                "participant_id": "p1",
                "seat_ids": ["s3"],
                "tags": ["front"],
            },
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert result.assignment["p1"] == "s4"


def test_alternate_tag_supports_a_non_adjacent_relation() -> None:
    snapshot = make_snapshot(person_count=2, seat_count=4)
    snapshot.participants[0].tags = {"profile": "agitateur"}
    snapshot.participants[1].tags = {"profile": "agitateur"}
    snapshot.rules = [
        Rule(
            name="Alterner les profils",
            kind=RuleKind.ALTERNATE_TAG,
            params={
                "tag_key": "profile",
                "values": ["agitateur"],
                "relation": "adjacent",
            },
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    geometry = RoomGeometry(snapshot.room)
    assert result.status == "optimal"
    assert not geometry.adjacent(result.assignment["p1"], result.assignment["p2"])


def test_max_board_distance_is_geometric() -> None:
    snapshot = make_snapshot(person_count=1, seat_count=4)
    geometry = RoomGeometry(snapshot.room)
    closest = min(geometry.board_distance(seat.id) for seat in geometry.seats)
    snapshot.rules = [
        Rule(
            name="Rester près du tableau",
            kind=RuleKind.MAX_BOARD_DISTANCE,
            params={"participant": "p1", "max_distance": closest + 1e-6},
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert geometry.board_distance(result.assignment["p1"]) <= closest + 1e-6


@pytest.mark.parametrize("need_field", ["vision_need", "hearing_need"])
def test_high_accessibility_need_enforces_the_front(need_field: str) -> None:
    snapshot = make_snapshot(person_count=1, seat_count=4)
    setattr(snapshot.participants[0], need_field, 3)
    snapshot.settings.accessibility_hard = True
    snapshot.settings.hard_front_fraction = 0.25
    geometry = RoomGeometry(snapshot.room)
    closest = min(geometry.board_distance(seat.id) for seat in geometry.seats)
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert geometry.board_distance(result.assignment["p1"]) == pytest.approx(closest)
    assert validate_assignment(snapshot, result.assignment) == []


def test_soft_vision_need_prefers_the_closest_seat() -> None:
    snapshot = make_snapshot(person_count=1, seat_count=4)
    snapshot.participants[0].vision_need = 2
    snapshot.settings.accessibility_hard = False
    geometry = RoomGeometry(snapshot.room)
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert geometry.board_distance(result.assignment["p1"]) == pytest.approx(
        min(geometry.board_distance(seat.id) for seat in geometry.seats)
    )


def test_hand_conflict_is_ordered_even_when_relation_defaults_to_bidirectional() -> None:
    room = Room(
        board=Board(x=0, y=0, width=200),
        seats=[
            Seat(id="left", label="Left", x=50, y=100),
            Seat(id="right", label="Right", x=150, y=100),
        ],
        relations=[
            SeatRelation(
                a="left",
                b="right",
                kinds=[RelationKind.HAND_CONFLICT],
            )
        ],
    )
    geometry = RoomGeometry(room)
    assert geometry.hand_conflict("left", "right")
    assert not geometry.hand_conflict("right", "left")


def test_directional_hand_rule_does_not_sort_participant_ids() -> None:
    snapshot = make_snapshot(person_count=2, seat_count=2)
    snapshot.participants = [
        Participant(id="z_right", name="Right", handedness="R"),
        Participant(id="a_left", name="Left", handedness="L"),
    ]
    snapshot.settings.hand_collision = "hard"
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert result.assignment == {"z_right": "s2", "a_left": "s1"}
    assert validate_assignment(snapshot, result.assignment) == []


def test_grade_mix_rewards_complementary_adjacent_levels() -> None:
    snapshot = make_snapshot(person_count=2, seat_count=4)
    snapshot.participants[0].grade = 4
    snapshot.participants[1].grade = 18
    snapshot.settings.grade_mix_weight = 100
    snapshot.settings.grade_mix_min_difference = 5
    result = SeatingOptimizer(snapshot).solve()
    geometry = RoomGeometry(snapshot.room)
    assert result.status == "optimal"
    assert geometry.adjacent(result.assignment["p1"], result.assignment["p2"])


def test_grade_balance_distributes_levels_between_tables() -> None:
    snapshot = make_snapshot(person_count=4, seat_count=4)
    for person, grade in zip(snapshot.participants, [10, 10, 0, 0], strict=True):
        person.grade = grade
    snapshot.settings.grade_balance_weight = 1
    result = SeatingOptimizer(snapshot).solve()
    geometry = RoomGeometry(snapshot.room)
    grade_by_id = {person.id: float(person.grade) for person in snapshot.participants}
    sums: dict[str, float] = defaultdict(float)
    for person_id, seat_id in result.assignment.items():
        table_id = geometry.by_id[seat_id].furniture_id
        assert table_id is not None
        sums[table_id] += grade_by_id[person_id]
    assert result.status == "optimal"
    assert set(sums.values()) == {10.0}


def test_participant_notes_survive_the_typed_contract() -> None:
    participant = Participant(name="Élève", notes="Éviter la fenêtre.", grade=12.5)
    payload = participant.model_dump(mode="json")
    assert Participant.model_validate(payload).notes == "Éviter la fenêtre."


def test_timeout_during_core_reduction_never_claims_minimality(monkeypatch) -> None:
    snapshot = make_snapshot(2)
    snapshot.rules = [
        Rule(
            id="must_s1",
            name="P1 doit être en S1",
            kind=RuleKind.FIXED_SEAT,
            params={"participant_id": "p1", "seat_id": "s1"},
        ),
        Rule(
            id="not_s1",
            name="P1 ne peut pas être en S1",
            kind=RuleKind.FORBIDDEN_SEATS,
            params={"participant_id": "p1", "seat_ids": ["s1"]},
        ),
    ]
    monkeypatch.setattr(
        SeatingOptimizer,
        "_shrink_core",
        lambda self, rules: (rules, False),
    )
    result = SeatingOptimizer(snapshot).solve()
    core = next(item for item in result.diagnostics if item["type"] == "unsat_core")
    assert core["minimal_by_deletion"] is False
    assert "pas été prouvée minimale" in core["message"]


def test_core_check_finishing_after_deadline_is_not_minimal(monkeypatch) -> None:
    snapshot = make_snapshot(2)
    snapshot.settings.diagnostic_time_limit_seconds = 0.5
    snapshot.rules = [
        Rule(
            id="must_s1",
            name="P1 doit être en S1",
            kind=RuleKind.FIXED_SEAT,
            params={"participant_id": "p1", "seat_id": "s1"},
        ),
        Rule(
            id="not_s1",
            name="P1 ne peut pas être en S1",
            kind=RuleKind.FORBIDDEN_SEATS,
            params={"participant_id": "p1", "seat_ids": ["s1"]},
        ),
    ]
    optimizer = SeatingOptimizer(snapshot)
    clock = iter([0.0, 0.0, 0.0, 1.0, 1.0])
    monkeypatch.setattr(engine_module, "monotonic", lambda: next(clock))

    _, minimal_by_deletion = optimizer._shrink_core(snapshot.rules)

    assert minimal_by_deletion is False
