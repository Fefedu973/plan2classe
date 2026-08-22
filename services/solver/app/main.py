from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from app.models import ProjectSnapshot, SolveResult
from app.solver import SeatingOptimizer


class HealthResponse(BaseModel):
    ok: bool
    service: str
    solver: str


app = FastAPI(
    title="Plan2Classe Solver",
    description="Private stateless OR-Tools CP-SAT optimization service.",
    version="1.0.0",
)

# CP-SAT is CPU-bound. A single in-process queue prevents concurrent requests
# from oversubscribing a small container; horizontal scaling can be added by the
# caller without changing the JSON contract.
_solve_slot = asyncio.Semaphore(1)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        service="plan2classe-solver",
        solver="OR-Tools CP-SAT",
    )


def _solve(snapshot: ProjectSnapshot) -> SolveResult:
    try:
        return SeatingOptimizer(snapshot).solve()
    except Exception as error:  # pragma: no cover - defensive service boundary
        diagnostic: dict[str, Any] = {
            "type": "solver_exception",
            "message": str(error),
        }
        return SolveResult(status="error", diagnostics=[diagnostic])


@app.post("/solve", response_model=SolveResult)
async def solve(snapshot: ProjectSnapshot) -> SolveResult:
    async with _solve_slot:
        return await asyncio.to_thread(_solve, snapshot)
