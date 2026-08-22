from __future__ import annotations

from app.models import (
    Participant,
    PreferenceResponse,
    RankedNeighbor,
    RelationKind,
    Rule,
    RuleKind,
    SeatRelation,
)
from app.solver import SeatingOptimizer
from app.solver.geometry import RoomGeometry
from app.solver.validation import validate_assignment
from tests.helpers import brute_force_optimum, evaluate_assignment, make_snapshot


def test_matches_bruteforce_lexicographic_optimum() -> None:
    snapshot = make_snapshot(4)
    snapshot.responses = [
        PreferenceResponse(
            participant_id="p1",
            submitted_at="2026-01-01T10:00:00+00:00",
            seat_ranking=["s1", "s3"],
            desired_neighbors=[RankedNeighbor(participant_id="p2")],
        ),
        PreferenceResponse(
            participant_id="p2",
            submitted_at="2026-01-01T10:01:00+00:00",
            seat_ranking=["s2", "s4"],
            desired_neighbors=[RankedNeighbor(participant_id="p1")],
        ),
        PreferenceResponse(
            participant_id="p3",
            submitted_at="2026-01-01T10:02:00+00:00",
            seat_ranking=["s3", "s1"],
            avoided_neighbors=[RankedNeighbor(participant_id="p4")],
        ),
        PreferenceResponse(
            participant_id="p4",
            submitted_at="2026-01-01T10:03:00+00:00",
            seat_ranking=["s4", "s2"],
        ),
    ]
    expected, _ = brute_force_optimum(snapshot)
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert evaluate_assignment(snapshot, result.assignment) == expected
    assert result.hard_constraints_verified


def test_hard_neighbor_relation_is_respected() -> None:
    snapshot = make_snapshot(4)
    snapshot.rules = [
        Rule(
            id="r_adj",
            name="P1 et P2 voisins",
            kind=RuleKind.PAIR_RELATION,
            hard=True,
            params={"a": "p1", "b": "p2", "relation": "adjacent", "required": True},
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    geometry = RoomGeometry(snapshot.room)
    assert geometry.adjacent(result.assignment["p1"], result.assignment["p2"])
    assert validate_assignment(snapshot, result.assignment) == []


def test_same_table_is_stricter_than_near() -> None:
    snapshot = make_snapshot(4)
    # s2 and s3 are geometrically separated tables; make them explicitly near.
    snapshot.room.relations.append(
        SeatRelation(a="s2", b="s3", kinds=[RelationKind.NEAR], bidirectional=True)
    )
    snapshot.rules = [
        Rule(
            name="P1 P2 même table",
            kind=RuleKind.PAIR_RELATION,
            hard=True,
            params={"a": "p1", "b": "p2", "relation": "same_table", "required": True},
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    geometry = RoomGeometry(snapshot.room)
    assert result.status == "optimal"
    assert geometry.same_table(result.assignment["p1"], result.assignment["p2"])


def test_unanswered_people_are_still_assigned() -> None:
    snapshot = make_snapshot(4)
    snapshot.responses = [PreferenceResponse(participant_id="p1", seat_ranking=["s1"])]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert set(result.assignment) == {"p1", "p2", "p3", "p4"}
    assert len(set(result.assignment.values())) == 4
    by_person = {person.participant_id: person for person in result.people}
    assert by_person["p2"].response_received is False


def test_first_arrival_breaks_an_equally_fair_conflict() -> None:
    snapshot = make_snapshot(2)
    snapshot.settings.arrival_policy = "linear"
    snapshot.settings.arrival_bonus_percent = 100
    snapshot.responses = [
        PreferenceResponse(
            participant_id="p1",
            submitted_at="2026-01-01T10:00:00+00:00",
            seat_ranking=["s1"],
        ),
        PreferenceResponse(
            participant_id="p2",
            submitted_at="2026-01-01T11:00:00+00:00",
            seat_ranking=["s1"],
        ),
    ]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert result.assignment["p1"] == "s1"


def test_stability_keeps_previous_plan_when_quality_is_equal() -> None:
    snapshot = make_snapshot(4)
    snapshot.previous_assignment = {"p1": "s4", "p2": "s3", "p3": "s2", "p4": "s1"}
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert result.assignment == snapshot.previous_assignment
    assert result.unchanged_count == 4


def test_infeasible_rules_return_an_explainable_core() -> None:
    snapshot = make_snapshot(2)
    snapshot.rules = [
        Rule(
            id="must_s1",
            name="P1 doit être en S1",
            kind=RuleKind.FIXED_SEAT,
            hard=True,
            params={"participant_id": "p1", "seat_id": "s1"},
        ),
        Rule(
            id="not_s1",
            name="P1 ne peut pas être en S1",
            kind=RuleKind.FORBIDDEN_SEATS,
            hard=True,
            params={"participant_id": "p1", "seat_ids": ["s1"]},
        ),
    ]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "infeasible"
    core = next(item for item in result.diagnostics if item["type"] == "unsat_core")
    assert {rule["id"] for rule in core["rules"]} == {"must_s1", "not_s1"}


def test_group_too_large_for_a_table_is_diagnosed() -> None:
    snapshot = make_snapshot(4)
    snapshot.rules = [
        Rule(
            id="three_same",
            name="Trois personnes ensemble",
            kind=RuleKind.GROUP_SAME_TABLE,
            hard=True,
            params={"participant_ids": ["p1", "p2", "p3"]},
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "infeasible"
    assert result.diagnostics[0]["rules"][0]["id"] == "three_same"


def test_capacity_preflight_is_clear() -> None:
    snapshot = make_snapshot(person_count=3, seat_count=2)
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "infeasible"
    assert any(item["type"] == "capacity" for item in result.diagnostics)


def test_required_seat_tag_for_medical_need() -> None:
    snapshot = make_snapshot(4)
    snapshot.rules = [
        Rule(
            name="P4 devant",
            kind=RuleKind.REQUIRE_SEAT_TAGS,
            hard=True,
            source="medical",
            params={"participant_id": "p4", "tags": ["front"], "mode": "any"},
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    seat = next(seat for seat in snapshot.room.seats if seat.id == result.assignment["p4"])
    assert "front" in seat.tags


def test_tag_not_adjacent_rule() -> None:
    snapshot = make_snapshot(4)
    snapshot.participants[0].tags = {"team": "red"}
    snapshot.participants[1].tags = {"team": "red"}
    snapshot.rules = [
        Rule(
            name="Séparer red",
            kind=RuleKind.TAG_NOT_ADJACENT,
            hard=True,
            params={"tag_key": "team", "values": ["red"]},
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    geometry = RoomGeometry(snapshot.room)
    assert result.status == "optimal"
    assert not geometry.adjacent(result.assignment["p1"], result.assignment["p2"])


def test_soft_admin_rule_can_be_broken_but_is_scored() -> None:
    snapshot = make_snapshot(2)
    snapshot.rules = [
        Rule(
            id="soft_s1",
            name="P1 préférablement en S1",
            kind=RuleKind.FIXED_SEAT,
            hard=False,
            weight=500,
            params={"participant_id": "p1", "seat_id": "s1"},
        )
    ]
    result = SeatingOptimizer(snapshot).solve()
    assert result.status == "optimal"
    assert result.assignment["p1"] == "s1"
    p1 = next(person for person in result.people if person.participant_id == "p1")
    assert any(item["source_id"] == "soft_s1" for item in p1.breakdown)
