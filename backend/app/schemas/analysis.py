from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.memory import AnalysisStatus, MemoryEmotion

class EmptyCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')

class FeedbackCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    corrected_emotion_code: str = Field(pattern=r'^[a-z][a-z0-9_]{0,63}$')
    expected_version: int = Field(ge=1, strict=True)

class AnalysisRead(BaseModel):
    memory_id: UUID
    status: AnalysisStatus
    predicted_emotion: MemoryEmotion | None
    predicted_confidence: float | None
    final_emotion: MemoryEmotion | None
    final_emotion_source: str | None
    model_version: str | None
    analyzed_at: datetime | None
    version: int
    job_id: UUID | None
    trigger_source: str | None
    error_code: str | None

class FeedbackResult(BaseModel):
    analysis: AnalysisRead
    changed: bool
    feedback_id: UUID | None = None
