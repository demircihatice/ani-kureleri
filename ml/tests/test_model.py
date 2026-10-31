import torch
from torchvision.models import ResNet18_Weights

from ani_kureleri_ml import model as modul


def test_final_katman_yedi_cikis():
    model = modul.create_model(weights=None)
    assert model.fc.in_features == 512
    assert model.fc.out_features == 7


def test_gercek_forward_pass():
    model = modul.create_model(weights=None).eval()
    # Rastgele batch sadece mimari smoke testidir; gerçek prediction değildir.
    batch = torch.randn(2, 3, 224, 224)
    with torch.inference_mode():
        output = model(batch)
    assert output.shape == (2, 7)
    assert torch.isfinite(output).all()


def test_freeze_backbone_ve_batchnorm():
    model = modul.create_model(weights=None, freeze_backbone=True).train()
    assert all(not p.requires_grad for n, p in model.named_parameters() if not n.startswith("backbone.fc."))
    assert all(p.requires_grad for p in model.fc.parameters())
    assert model.fc.training and not model.backbone.bn1.training
    onceki = model.backbone.bn1.running_mean.clone()
    model(torch.randn(2, 3, 224, 224)).sum().backward()
    assert torch.equal(onceki, model.backbone.bn1.running_mean)
    assert model.backbone.conv1.weight.grad is None
    assert model.fc.weight.grad is not None


def test_unfreeze_tum_katmanlar():
    model = modul.create_model(weights=None, freeze_backbone=False).train()
    assert all(p.requires_grad for p in model.parameters())
    assert model.backbone.bn1.training
    model.eval()
    assert not model.fc.training


def test_pretrained_secimi_indirmeden_aktarilir(monkeypatch):
    original = modul.resnet18
    calls = []
    def resnet_stub(*, weights):
        calls.append(weights)
        return original(weights=None)
    monkeypatch.setattr(modul, "resnet18", resnet_stub)
    modul.create_model(weights=ResNet18_Weights.IMAGENET1K_V1)
    assert calls == [ResNet18_Weights.IMAGENET1K_V1]
