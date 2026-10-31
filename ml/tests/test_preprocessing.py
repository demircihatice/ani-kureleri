import numpy as np
from PIL import Image
import pytest
import torch

from ani_kureleri_ml.config import GoruntuAyarlari
from ani_kureleri_ml.preprocessing import training_transform, validation_transform


@pytest.mark.parametrize("mode", ["RGB", "L", "RGBA"])
def test_tensor_boyutu_ve_finite(mode):
    # Programatik görüntü yalnız preprocessing testi içindir; training datası değildir.
    image = Image.new(mode, (71, 49))
    tensor = validation_transform()(image)
    assert tensor.shape == (3, 224, 224)
    assert tensor.dtype == torch.float32
    assert torch.isfinite(tensor).all()


def test_validation_deterministic():
    pixels = np.arange(80 * 90 * 3, dtype=np.uint8).reshape(80, 90, 3)
    image = Image.fromarray(pixels)
    pipeline = validation_transform()
    assert torch.equal(pipeline(image), pipeline(image))


def test_imagenet_normalizasyonu():
    tensor = validation_transform()(Image.new("RGB", (256, 256), color=(255, 255, 255)))
    expected = (torch.ones(3) - torch.tensor(GoruntuAyarlari().mean)) / torch.tensor(GoruntuAyarlari().std)
    assert torch.allclose(tensor[:, 0, 0], expected)


def test_training_pipeline_boyutu():
    tensor = training_transform()(Image.new("RGB", (250, 300)))
    assert tensor.shape == (3, 224, 224)
    assert torch.isfinite(tensor).all()


def test_gecersiz_ayar_reddedilir():
    with pytest.raises(ValueError):
        GoruntuAyarlari(input_size=224, resize_size=100)
