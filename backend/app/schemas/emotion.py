from uuid import UUID
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class EmotionCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    code: str
    display_name_tr: str
    color_hex: str = Field(pattern=r'^#[0-9A-Fa-f]{6}$')
    sort_order: int = Field(ge=0)
    category_kind: Literal['model', 'fallback', 'legacy']
