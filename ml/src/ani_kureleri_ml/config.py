from dataclasses import dataclass


@dataclass(frozen=True)
class GoruntuAyarlari:
    input_size: int = 224
    resize_size: int = 256
    mean: tuple[float, float, float] = (0.485, 0.456, 0.406)
    std: tuple[float, float, float] = (0.229, 0.224, 0.225)

    def __post_init__(self):
        if self.input_size < 1 or self.resize_size < self.input_size:
            raise ValueError("Resize boyutu pozitif crop boyutundan küçük olamaz.")
        if len(self.mean) != 3 or len(self.std) != 3 or any(s <= 0 for s in self.std):
            raise ValueError("RGB normalizasyonu üç ortalama ve üç pozitif std gerektirir.")
