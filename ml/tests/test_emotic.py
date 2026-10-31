import pytest

from ani_kureleri_ml.dataset import DatasetFormatError
from ani_kureleri_ml.emotic import map_categories, normalize_split


@pytest.mark.parametrize("raw,expected", [
    ("Anger", "anger"), ("Embarrassment", "shame"), ("Happiness", "joy"),
    ("Aversion", "disgust"), ("Sadness", "sadness"), ("Surprise", "surprise"), ("Fear", "fear"),
])
def test_merkezi_mapping(raw, expected):
    assert map_categories([raw]) == (expected,)


def test_unsupported_strict_ve_non_strict():
    assert map_categories(["Peace"]) == ()
    assert map_categories(["Happiness", "Peace"]) == ("joy",)
    assert map_categories(["happiness"]) == ()  # Case-sensitive.
    with pytest.raises(DatasetFormatError, match="Peace"):
        map_categories(["Peace"], strict=True)


def test_bos_tek_ve_multilabel():
    assert map_categories([]) == ()
    assert map_categories(["Happiness", "Happiness"]) == ("joy",)
    assert map_categories(["Happiness", "Surprise"]) == ("joy", "surprise")


@pytest.mark.parametrize("raw,expected", [("train", "train"), ("validation", "val"), ("val", "val"), ("test", "test")])
def test_split_normalization(raw, expected):
    assert normalize_split(raw) == expected


def test_bilinmeyen_split():
    with pytest.raises(DatasetFormatError, match="split"):
        normalize_split("TRAIN")
