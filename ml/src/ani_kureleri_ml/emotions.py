"""Sınıf sırası eğitim, inference ve ilerideki backend sözleşmesi için sabittir."""
from types import MappingProxyType
from typing import Final

EMOTION_CLASSES: Final = ("anger", "shame", "joy", "disgust", "sadness", "surprise", "fear")
CLASS_TO_INDEX: Final = MappingProxyType({ad: i for i, ad in enumerate(EMOTION_CLASSES)})
INDEX_TO_CLASS: Final = MappingProxyType(dict(enumerate(EMOTION_CLASSES)))
EMOTIC_TO_PROJECT_CLASS: Final = MappingProxyType({
    "Anger": "anger",
    # Embarrassment=shame ve Aversion=disgust projemizin etiket eşleştirmeleridir;
    # tüm bağlamlarda psikolojik eşdeğerlik iddiası taşımaz.
    "Embarrassment": "shame",
    "Happiness": "joy",
    "Aversion": "disgust",
    "Sadness": "sadness",
    "Surprise": "surprise",
    "Fear": "fear",
})


def hedef_siniflar(etiketler: tuple[str, ...]) -> tuple[str, ...]:
    """Birden fazla hedefi seçime zorlamaz; tekrarları kaldırıp sabit sırada döner."""
    hedefler = {EMOTIC_TO_PROJECT_CLASS[e] for e in etiketler if e in EMOTIC_TO_PROJECT_CLASS}
    return tuple(ad for ad in EMOTION_CLASSES if ad in hedefler)
