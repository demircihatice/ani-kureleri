import json

from PIL import Image
import pytest

from ani_kureleri_ml.dataset import DatasetFormatError, DatasetNotReadyError, EmoticDataset, load_annotations
from ani_kureleri_ml.dataset_audit import audit_dataset, image_sha256, main
from ani_kureleri_ml.emotions import EMOTIC_TO_PROJECT_CLASS, hedef_siniflar


@pytest.mark.parametrize("source,target", [
    ("Anger", "anger"), ("Embarrassment", "shame"), ("Happiness", "joy"),
    ("Aversion", "disgust"), ("Sadness", "sadness"), ("Surprise", "surprise"), ("Fear", "fear"),
])
def test_emotic_mapping(source, target):
    assert EMOTIC_TO_PROJECT_CLASS[source] == target


def test_multi_target_ve_tekrar_etiket():
    assert hedef_siniflar(("Anger", "Happiness", "Engagement")) == ("anger", "joy")
    assert hedef_siniflar(("Happiness", "Happiness", "Engagement")) == ("joy",)
    assert hedef_siniflar(("Peace",)) == ()


def test_dataset_yoksa_kontrollu_hata(tmp_path, capsys):
    with pytest.raises(DatasetNotReadyError, match="EMOTIC dataset bulunamadı"):
        EmoticDataset(tmp_path / "yok")
    with pytest.raises(DatasetNotReadyError):
        EmoticDataset(tmp_path)
    assert main(["--root", str(tmp_path / "yok")]) == 2
    assert "EMOTIC dataset bulunamadı." in capsys.readouterr().out


def test_sha256_ayni_dosya_ve_kopyasi(tmp_path):
    image = tmp_path / "test.png"
    Image.new("RGB", (8, 8)).save(image)
    copy = tmp_path / "copy.png"
    copy.write_bytes(image.read_bytes())
    assert image_sha256(image) == image_sha256(image) == image_sha256(copy)
    assert len(image_sha256(image)) == 64


def test_manifest_adapter_ve_audit_yalniz_gecici_test_girdileri(tmp_path):
    # Yalnız parser/audit unit test girdileri. EMOTIC verisi/eğitim seti değildir.
    Image.new("RGB", (8, 8)).save(tmp_path / "one.png")
    (tmp_path / "copy.png").write_bytes((tmp_path / "one.png").read_bytes())
    (tmp_path / "broken.jpg").write_bytes(b"invalid image")
    rows = [
        {"image_path": "one.png", "labels": ["Happiness", "Engagement"], "split": "train"},
        {"image_path": "copy.png", "labels": ["Happiness"], "split": "test"},
        {"image_path": "ambiguous.png", "labels": ["Anger"], "split": "train"},
        {"image_path": "ambiguous.png", "labels": ["Fear"], "split": "train"},
        {"image_path": "broken.jpg", "labels": ["Sadness"]},
        {"image_path": "missing.png", "labels": ["Peace"]},
    ]
    (tmp_path / "annotations.json").write_text(json.dumps(rows), encoding="utf-8")
    records = load_annotations(tmp_path)
    assert len(records) == 5  # Aynı görüntünün kişilerinden gelen iki hedef birleştirildi.
    report = audit_dataset(tmp_path)
    assert report.total_samples == 5
    assert report.class_counts["joy"] == 2 and report.eligible_counts["joy"] == 2
    assert report.class_counts["sadness"] == 1 and report.eligible_counts["sadness"] == 0
    assert report.unmapped_labels == {"Engagement": 1, "Peace": 1}
    assert report.ambiguous_count == 1 and report.no_target_count == 1
    assert report.unreadable_image_count == 3
    assert len(report.duplicate_groups) == len(report.split_leakage) == 1
    assert "sadness" in report.missing_classes and "joy" not in report.missing_classes
    dataset = EmoticDataset(tmp_path, split="train")
    assert len(dataset) == 1
    tensor, label = dataset[0]
    assert tensor.shape == (3, 224, 224) and label == 2


@pytest.mark.parametrize("content", ["not json", "{}", '[{"image_path":"../outside.jpg","labels":["Anger"]}]',
    '[{"image_path":"x.jpg","labels":"Anger"}]', '[{"image_path":"x.jpg","labels":[],"split":"bad"}]'])
def test_bozuk_manifest_ve_kok_disina_cikis(tmp_path, content):
    (tmp_path / "annotations.json").write_text(content, encoding="utf-8")
    with pytest.raises(DatasetFormatError):
        load_annotations(tmp_path)


def test_bos_manifest_hazir_sayilmaz(tmp_path):
    (tmp_path / "annotations.json").write_text("[]", encoding="utf-8")
    with pytest.raises(DatasetNotReadyError):
        load_annotations(tmp_path)
