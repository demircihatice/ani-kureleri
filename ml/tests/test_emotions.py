import pytest

from ani_kureleri_ml.emotions import CLASS_TO_INDEX, EMOTION_CLASSES, INDEX_TO_CLASS


def test_yedi_sinif():
    assert len(EMOTION_CLASSES) == 7


def test_sira_sozlesmesi():
    assert EMOTION_CLASSES == ("anger", "shame", "joy", "disgust", "sadness", "surprise", "fear")
    assert tuple(CLASS_TO_INDEX) == EMOTION_CLASSES
    assert tuple(INDEX_TO_CLASS.values()) == EMOTION_CLASSES


def test_aleksitimi_sinif_degil():
    assert "alexithymia" not in EMOTION_CLASSES


def test_mapping_sabit():
    with pytest.raises(TypeError):
        CLASS_TO_INDEX["joy"] = 9
    with pytest.raises(TypeError):
        INDEX_TO_CLASS[9] = "alexithymia"
