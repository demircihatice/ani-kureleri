from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MemoryFeedbackRead(BaseModel):
    """Sunucuda memory'den türetilmiş snapshot; istemci yazma DTO'su değildir."""
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    memory_id: UUID
    predicted_emotion_id: UUID
    previous_final_emotion_id: UUID
    corrected_emotion_id: UUID
    predicted_confidence: float = Field(ge=0, le=1, allow_inf_nan=False)
    model_version: str
    created_at: datetime
    request_key: UUID
