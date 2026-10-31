from PIL import Image, ImageOps
from torchvision import transforms
from torchvision.transforms import InterpolationMode

from .config import GoruntuAyarlari


def rgb_hazirla(goruntu: Image.Image) -> Image.Image:
    """Telefon fotoğraflarındaki EXIF yönünü uygular; gri/RGBA görüntüyü RGB yapar."""
    return ImageOps.exif_transpose(goruntu).convert("RGB")


def validation_transform(ayar: GoruntuAyarlari = GoruntuAyarlari()) -> transforms.Compose:
    return transforms.Compose([
        transforms.Lambda(rgb_hazirla),
        transforms.Resize(ayar.resize_size, interpolation=InterpolationMode.BILINEAR, antialias=True),
        transforms.CenterCrop(ayar.input_size),
        transforms.ToTensor(),
        transforms.Normalize(ayar.mean, ayar.std),
    ])


def training_transform(ayar: GoruntuAyarlari = GoruntuAyarlari()) -> transforms.Compose:
    return transforms.Compose([
        transforms.Lambda(rgb_hazirla),
        transforms.RandomResizedCrop(ayar.input_size, scale=(0.8, 1.0), antialias=True),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(8),
        transforms.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.1, hue=0.02),
        transforms.ToTensor(),
        transforms.Normalize(ayar.mean, ayar.std),
    ])
