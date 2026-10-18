"""Mevcut DB'nin kısmi okuma eşlemeleri. create_all/autogenerate ile şema kurulmaz."""
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Double, FetchedValue, ForeignKey, Integer, Text, Uuid, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class EmotionCategory(Base):
    __tablename__ = 'emotion_categories'
    __table_args__ = {'schema': 'public'}

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    code: Mapped[str] = mapped_column(Text, unique=True)
    display_name_tr: Mapped[str] = mapped_column(Text)
    color_hex: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text('true'))
    category_kind: Mapped[str] = mapped_column(Text, server_default=text("'model'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('now()'))
    legacy_emotion_type: Mapped[str | None] = mapped_column(Text, unique=True)


class Memory(Base):
    __tablename__ = 'memories'
    __table_args__ = {'schema': 'public'}

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    # auth.users/spheres bu kısmi metadata'ya eklenmez; FK'leri migration yönetir.
    user_id: Mapped[UUID] = mapped_column(Uuid)
    sphere_id: Mapped[UUID | None] = mapped_column(Uuid, server_onupdate=FetchedValue())
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str] = mapped_column(Text)
    memory_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('now()'))
    analysis_status: Mapped[str] = mapped_column(Text, server_default=text("'not_required'"))
    predicted_emotion_id: Mapped[UUID | None] = mapped_column(ForeignKey('public.emotion_categories.id'))
    predicted_confidence: Mapped[float | None] = mapped_column(Double)
    final_emotion_id: Mapped[UUID | None] = mapped_column(ForeignKey('public.emotion_categories.id'), server_default=FetchedValue(), server_onupdate=FetchedValue())
    final_emotion_source: Mapped[str | None] = mapped_column(Text, server_default=FetchedValue(), server_onupdate=FetchedValue())
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    model_version: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(BigInteger, server_default=text('1'), server_onupdate=FetchedValue())
    __mapper_args__ = {'version_id_col': version, 'version_id_generator': False, 'eager_defaults': True}


class MemoryFeedback(Base):
    __tablename__ = 'memory_feedback'
    __table_args__ = {'schema': 'public'}

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    user_id: Mapped[UUID] = mapped_column(Uuid, server_default=text('auth.uid()'))
    memory_id: Mapped[UUID] = mapped_column(ForeignKey('public.memories.id'))
    predicted_emotion_id: Mapped[UUID] = mapped_column(ForeignKey('public.emotion_categories.id'), server_default=FetchedValue())
    previous_final_emotion_id: Mapped[UUID] = mapped_column(ForeignKey('public.emotion_categories.id'), server_default=FetchedValue())
    corrected_emotion_id: Mapped[UUID] = mapped_column(ForeignKey('public.emotion_categories.id'))
    predicted_confidence: Mapped[float] = mapped_column(Double, server_default=FetchedValue())
    model_version: Mapped[str] = mapped_column(Text, server_default=FetchedValue())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('now()'))
    request_key: Mapped[UUID] = mapped_column(Uuid)


class MemoryImage(Base):
    __tablename__ = 'memory_images'
    __table_args__ = {'schema': 'public'}

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=text('gen_random_uuid()'))
    memory_id: Mapped[UUID] = mapped_column(ForeignKey('public.memories.id'))
    storage_path: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('now()'))


class MemoryCreationRequest(Base):
    __tablename__ = 'memory_creation_requests'
    __table_args__ = {'schema': 'public'}

    memory_id: Mapped[UUID] = mapped_column(ForeignKey('public.memories.id'), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(Uuid)
    payload_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text('now()'))


class AnalysisJob(Base):
    __tablename__ = 'analysis_jobs'
    __table_args__ = {'schema': 'public'}
    id: Mapped[UUID] = mapped_column(Uuid,primary_key=True,server_default=text('gen_random_uuid()'))
    memory_id: Mapped[UUID] = mapped_column(ForeignKey('public.memories.id'))
    user_id: Mapped[UUID] = mapped_column(Uuid)
    status: Mapped[str] = mapped_column(Text)
    trigger_source: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(Text)
    model_version: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),server_default=text('now()'))
