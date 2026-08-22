from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import SolveResult
from tests.helpers import make_snapshot


client = TestClient(app)


def test_health_contract() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "service": "plan2classe-solver",
        "solver": "OR-Tools CP-SAT",
    }


def test_solve_accepts_a_project_snapshot_and_returns_a_solve_result() -> None:
    snapshot = make_snapshot(person_count=2, seat_count=2)
    snapshot.participants[0].notes = "Besoin pédagogique conservé dans le contrat."
    response = client.post("/solve", json=snapshot.model_dump(mode="json"))
    assert response.status_code == 200
    result = SolveResult.model_validate(response.json())
    assert result.status == "optimal"
    assert set(result.assignment) == {"p1", "p2"}
    assert len(set(result.assignment.values())) == 2
    assert result.hard_constraints_verified


def test_invalid_snapshot_is_rejected_before_solver_execution() -> None:
    payload = make_snapshot(person_count=1, seat_count=1).model_dump(mode="json")
    payload["responses"] = [
        {
            "participant_id": "unknown",
            "seat_ranking": [],
            "zone_ranking": [],
            "desired_neighbors": [],
            "avoided_neighbors": [],
        }
    ]
    response = client.post("/solve", json=payload)
    assert response.status_code == 422
    assert response.json()["detail"]
