from torch import nn
from torchvision.models import ResNet18_Weights, resnet18

from .emotions import EMOTION_CLASSES


class EmotionResNet18(nn.Module):
    """Freeze modunda BatchNorm istatistikleri de sabit kalır."""
    def __init__(self, *, weights: ResNet18_Weights | str | None, freeze_backbone: bool):
        super().__init__()
        self.backbone = resnet18(weights=weights)
        self.freeze_backbone = freeze_backbone
        for parametre in self.backbone.parameters():
            parametre.requires_grad_(not freeze_backbone)
        self.backbone.fc = nn.Linear(self.backbone.fc.in_features, len(EMOTION_CLASSES))
        self.train()

    @property
    def fc(self) -> nn.Linear:
        return self.backbone.fc

    def forward(self, batch):
        return self.backbone(batch)

    def train(self, mode: bool = True):
        super().train(mode)
        if self.freeze_backbone:
            self.backbone.eval()
            self.backbone.fc.train(mode)
        return self


def create_model(*, weights: ResNet18_Weights | str | None = None, freeze_backbone: bool = True) -> EmotionResNet18:
    """None çevrimdışı çalışır. Açıkça verilen pretrained ağırlıklar önbellekte yoksa indirilebilir."""
    return EmotionResNet18(weights=weights, freeze_backbone=freeze_backbone)
