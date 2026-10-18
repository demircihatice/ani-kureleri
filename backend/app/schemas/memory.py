from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
import re
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from app.schemas.emotion import EmotionCategoryRead

AnalysisStatus = Literal['not_required', 'awaiting_nfc', 'queued', 'processing', 'completed', 'failed', 'cancelled']
FinalEmotionSource = Literal['legacy_manual', 'model', 'fallback', 'user']


class MemoryAnalysisRead(BaseModel):
    """Okuma modeli; bir kullanıcı PATCH gövdesi olarak kullanılmaz."""
    model_config = ConfigDict(from_attributes=True, extra='forbid')
    analysis_status: AnalysisStatus
    predicted_emotion_id: UUID | None = None
    predicted_confidence: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    final_emotion_id: UUID | None = None
    final_emotion_source: FinalEmotionSource | None = None
    analyzed_at: datetime | None = None
    model_version: str | None = Field(default=None, min_length=1, max_length=200)
    version: int = Field(ge=1)

    @model_validator(mode='after')
    def tutarlilik(self):
        tahmin = [self.predicted_emotion_id, self.predicted_confidence, self.analyzed_at, self.model_version]
        if sum(v is not None for v in tahmin) not in (0, 4):
            raise ValueError('Tahmin bilgileri birlikte dolu veya birlikte boş olmalıdır.')
        if (self.analysis_status == 'completed') != (self.predicted_emotion_id is not None):
            raise ValueError('completed durumu başarılı tahmin gerektirir.')
        if (self.final_emotion_id is None) != (self.final_emotion_source is None):
            raise ValueError('Son duygu ve kaynağı birlikte verilmelidir.')
        if self.analysis_status in ('completed', 'not_required') and self.final_emotion_id is None:
            raise ValueError('Bu durumda son duygu zorunludur.')
        if self.final_emotion_source == 'model' and self.final_emotion_id != self.predicted_emotion_id:
            raise ValueError('Model kaynağı ilk tahmin ile aynı olmalıdır.')
        if self.final_emotion_source == 'fallback' and (self.predicted_emotion_id is None or self.final_emotion_id == self.predicted_emotion_id):
            raise ValueError('Fallback, model tahmininden ayrı bir son duygu gerektirir.')
        return self


class MemoryRead(MemoryAnalysisRead):
    id: UUID
    user_id: UUID
    sphere_id: UUID | None
    title: str
    description: str | None
    image_url: str
    memory_date: date
    created_at: datetime


Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
StoragePath = Annotated[str, StringConstraints(min_length=1, max_length=2048)]


def tarihi_dogrula(deger):
    if isinstance(deger, date) and not isinstance(deger, datetime):
        return deger
    if not isinstance(deger, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', deger):
        raise ValueError('Tarih YYYY-MM-DD biçiminde olmalıdır.')
    return deger


def aciklamayi_duzenle(deger):
    if isinstance(deger, str):
        return deger.strip() or None
    return deger


def gelecek_tarihi_engelle(deger: date | None):
    # Sunucunun saat diliminden bağımsız olarak Türkiye takvim günü kullanılır.
    bugun = datetime.now(timezone(timedelta(hours=3))).date()
    if deger is not None and deger > bugun:
        raise ValueError('Anı tarihi bugünden sonra olamaz.')
    return deger


class MemoryCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    title: Title
    description: str | None = Field(default=None, max_length=5000)
    memory_date: date
    storage_paths: list[StoragePath] = Field(min_length=1, max_length=5)
    _tarih = field_validator('memory_date', mode='before')(tarihi_dogrula)
    _gelecek_tarih = field_validator('memory_date')(gelecek_tarihi_engelle)
    _aciklama = field_validator('description', mode='before')(aciklamayi_duzenle)


class MemoryPatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(ge=1, le=9223372036854775807, strict=True)
    title: Title | None = None
    description: str | None = Field(default=None, max_length=5000)
    memory_date: date | None = None
    _tarih = field_validator('memory_date', mode='before')(tarihi_dogrula)
    _gelecek_tarih = field_validator('memory_date')(gelecek_tarihi_engelle)
    _aciklama = field_validator('description', mode='before')(aciklamayi_duzenle)

    @model_validator(mode='after')
    def degisiklik_var(self):
        alanlar = self.model_fields_set - {'version'}
        if not alanlar:
            raise ValueError('En az bir düzenlenebilir alan gereklidir.')
        if 'title' in alanlar and self.title is None:
            raise ValueError('Başlık boş olamaz.')
        return self


class MemoryListQuery(BaseModel):
    model_config = ConfigDict(extra='forbid')
    page: int = Field(default=1, ge=1, le=100000)
    page_size: int = Field(default=20, ge=1, le=100)
    emotion: str | None = Field(default=None, pattern=r'^[a-z][a-z0-9_]{0,63}$')


class MemoryPhoto(BaseModel):
    storage_path: str
    sort_order: int


class MemoryEmotion(EmotionCategoryRead):
    is_active: bool


class MemoryDetail(MemoryAnalysisRead):
    id: UUID
    user_id: UUID
    sphere_id: UUID | None
    title: str
    description: str | None
    memory_date: date
    created_at: datetime
    photos: list[MemoryPhoto]
    cover: MemoryPhoto | None
    predicted_emotion: MemoryEmotion | None
    final_emotion: MemoryEmotion | None


class MemoryListItem(BaseModel):
    id: UUID
    title: str
    memory_date: date
    created_at: datetime
    cover: MemoryPhoto | None
    photos: list[MemoryPhoto] = Field(default_factory=list)
    final_emotion: MemoryEmotion | None
    analysis_status: AnalysisStatus
    version: int


class MemoryPage(BaseModel):
    items: list[MemoryListItem]
    page: int
    page_size: int
    has_more: bool
