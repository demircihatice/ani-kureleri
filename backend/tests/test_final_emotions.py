from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.repositories import analysis_repository as repo
from app.schemas.memory import MemoryAnalysisRead
from app.services.analysis_service import AnalysisResult, apply_analysis_result


@pytest.mark.parametrize('code', ['anger','shame','joy','disgust','sadness','surprise','fear'])
def test_yedi_model_sinifi(code):
    assert AnalysisResult(emotion_code=code, confidence=0.1, model_version='unit').use_fallback is False


@pytest.mark.parametrize('code', ['alexithymia','happiness','calm','love','nostalgia'])
def test_fallback_ve_eski_kod_tahmin_sinifi_degil(code):
    with pytest.raises(ValidationError):
        AnalysisResult(emotion_code=code, confidence=0.9, model_version='unit')


async def test_fallback_yalniz_ic_komutta_acik_karar_olarak_tasinir(monkeypatch):
    command = AsyncMock(return_value={'changed': True})
    monkeypatch.setattr(repo, 'komut', command)
    db, mid = object(), uuid4()
    await apply_analysis_result(db, mid, AnalysisResult(emotion_code='joy', confidence=0.9,
        model_version='unit', use_fallback=True))
    command.assert_awaited_once_with(db, mid, 'result', code='joy', confidence=0.9, model='unit', fallback=True)
    # Güvene göre otomatik karar veya herhangi bir threshold yoktur.


def test_fallback_okuma_modelinde_tahminden_ayridir():
    predicted, final = uuid4(), uuid4()
    model = MemoryAnalysisRead(analysis_status='completed', predicted_emotion_id=predicted,
        predicted_confidence=0.2, analyzed_at=datetime.now(timezone.utc), model_version='unit',
        final_emotion_id=final, final_emotion_source='fallback', version=2)
    assert model.final_emotion_source == 'fallback'
    with pytest.raises(ValidationError):
        MemoryAnalysisRead(**(model.model_dump() | {'final_emotion_id': predicted}))
