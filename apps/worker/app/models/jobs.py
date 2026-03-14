from typing import Literal

from pydantic import BaseModel, Field


class SessionRef(BaseModel):
    year: int
    round: int
    sessionCode: str = Field(min_length=1)


class CreateIngestJobPayload(BaseModel):
    baseUrl: str
    ingestApiKey: str = Field(min_length=1)
    sessions: list[SessionRef]
    batchSize: int = Field(default=500, ge=1, le=5000)


class JobSummary(BaseModel):
    id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    createdAt: int | None = None
    startedAt: int | None = None
    completedAt: int | None = None
    total: int = 0
    completed: int = 0
    failed: int = 0
    queuePosition: int | None = None
    lastError: str | None = None
    results: list[dict] = Field(default_factory=list)
