import json
import numpy as np
from PIL import Image
import pytest
from scipy.io import savemat

from ani_kureleri_ml.dataset import DatasetFormatError, DatasetNotReadyError, EmoticDataset, load_annotations
from ani_kureleri_ml.dataset_audit import audit_dataset, audit_emotic_samples
from ani_kureleri_ml.emotic import export_manifest, load_emotic_mat, parse_emotic, to_image_annotations


def row(labels=None, split="train", path="context/a.jpg", **extra):
    return {"image_path": path, "categories": ["Happiness"] if labels is None else labels, "split": split, **extra}


def test_path_bbox_ve_split_korunur(tmp_path):
    sample, = parse_emotic([row(split="validation", bbox=[1, 2, 30, 40])], tmp_path)
    assert sample.image_path == tmp_path / "context" / "a.jpg"
    assert sample.label == "joy" and sample.split == "val" and sample.bbox == (1, 2, 30, 40)
    assert sample.skip_reason is None


def test_multi_label_policy(tmp_path):
    samples = parse_emotic([row([]), row(["Peace"]), row(["Happiness", "Surprise"]), row(["Happiness", "Peace"])], tmp_path)
    assert [s.skip_reason for s in samples] == ["empty", "unsupported", "multilabel", None]
    assert [s.label for s in samples] == [None, None, None, "joy"]


def test_split_dict_ve_numpy_alanlari(tmp_path):
    raw = {"__header__": b"unit fixture", "train": {"filename": "a.jpg", "folder": "context", "person": [
        {"body_bbox": np.array([[1, 2, 10, 20]]), "annotations_categories": np.array(["Happiness", "Peace"])},
        {"body_bbox": [3, 4, 8, 9], "combined_categories": ["Fear"]},
    ]}, "validation": [row(["Anger"], split="validation")], "test": []}
    samples = parse_emotic(raw, tmp_path)
    assert len(samples) == 3
    assert [s.split for s in samples] == ["train", "train", "val"]
    images = to_image_annotations(samples)
    train = next(r for r in images if r.split == "train")
    assert train.targets == ("joy", "fear") and len(train.bboxes) == 2


def test_annotator_celiskisi_combined_kategoriyi_degistirmez(tmp_path):
    raw = {"test": {"filename": "a.jpg", "person": {"annotations_categories": [
        {"categories": ["Happiness"]}, {"categories": ["Surprise"]}], "combined_categories": "Happiness"}}}
    sample, = parse_emotic(raw, tmp_path)
    assert sample.label == "joy" and sample.skip_reason is None
    assert sample.annotator_labels == ("Happiness", "Surprise")


def test_audit_counts(tmp_path):
    Image.new("RGB", (8, 8)).save(tmp_path / "present.png")
    samples = parse_emotic([
        row(path="present.png"), row(["Anger"], "validation"), row(["Fear"], "test"),
        row([], "test"), row(["Peace"], "train"), row(["Happiness", "Surprise"], "test"),
        row(["Happiness", "Peace"], "train"),
    ], tmp_path)
    report = audit_emotic_samples(samples)
    assert report.total_samples == 7 and report.accepted_count == 4 and report.skipped_count == 3
    assert report.multilabel_skipped_count == report.unsupported_skipped_count == report.empty_skipped_count == 1
    assert report.split_counts == {"train": 3, "val": 1, "test": 3}
    assert report.accepted_split_counts == {"train": 2, "val": 1, "test": 1}
    assert report.class_counts["joy"] == 2 and report.class_counts["anger"] == report.class_counts["fear"] == 1
    assert report.missing_image_count == 6 and report.unsupported_labels == {"Peace": 2}


def test_export_mevcut_adapterla_uyumlu_ve_kisileri_ayri_tutar(tmp_path):
    Image.new("RGB", (8, 8)).save(tmp_path / "valid.png")
    Image.new("RGB", (8, 8)).save(tmp_path / "conflict.png")
    samples = parse_emotic([row(path="valid.png", bbox=[0, 0, 8, 8]),
        row(path="conflict.png"), row(["Fear"], path="conflict.png")], tmp_path)
    output = tmp_path / "annotations.json"
    assert export_manifest(samples, tmp_path, output) == 3
    records = load_annotations(tmp_path)
    assert records[0].bboxes == ((0, 0, 8, 8),) and records[0].targets == ("joy",)
    assert [r.targets for r in records[1:]] == [("joy",), ("fear",)]
    assert len(EmoticDataset(tmp_path)) == 3
    assert json.loads(output.read_text(encoding="utf-8"))[0]["image_path"] == "valid.png"
    assert EmoticDataset(tmp_path)[0][1] == 2
    with pytest.raises(DatasetFormatError, match="zaten var"):
        export_manifest(samples, tmp_path, output)


def test_gercek_mat_yukleyici_minimal_fixture(tmp_path):
    # Yalnız MAT round-trip fixture'ı; gerçek EMOTIC dosyası değildir.
    mat = tmp_path / "fixture.mat"
    savemat(mat, {"train": {"filename": "a.jpg", "folder": "context", "person": {
        "body_bbox": [1, 2, 3, 4], "annotations_categories": np.array(["Happiness", "Peace"], dtype=object)}},
        "val": np.array([], dtype=object), "test": np.array([], dtype=object)})
    raw = load_emotic_mat(mat)
    sample, = parse_emotic(raw, tmp_path)
    assert sample.label == "joy" and sample.split == "train" and sample.bbox == (1, 2, 3, 4)
    assert load_annotations(tmp_path, mat)[0].targets == ("joy",)
    report = audit_dataset(tmp_path, mat)
    assert report.annotation_audit.accepted_count == 1 and report.annotation_audit.missing_image_count == 1
    assert report.total_samples == report.unreadable_image_count == 1


@pytest.mark.parametrize("entry,message", [
    ({"categories": [], "split": "train"}, "image path"),
    ({"image_path": "a.jpg", "split": "train"}, "categories"),
    ({"image_path": "a.jpg", "categories": []}, "split"),
    (row([1]), "categories"), (row(bbox=[1, 2, 3]), "bbox"),
    (row(bbox=[1, 2, 0, 4]), "bbox"), (row(bbox=[1, 2, float("nan"), 4]), "bbox"),
])
def test_anlamli_schema_hatalari(tmp_path, entry, message):
    with pytest.raises(DatasetFormatError, match=message):
        parse_emotic([entry], tmp_path)


@pytest.mark.parametrize("path", ["../escape.jpg", "/absolute.jpg", "C:\\private\\a.jpg", "\\\\host\\share\\a.jpg"])
def test_path_traversal(tmp_path, path):
    with pytest.raises(DatasetFormatError, match="kökünden"):
        parse_emotic([row(path=path)], tmp_path)


def test_bilinmeyen_schema_ve_celiski(tmp_path):
    for raw in [{"unexpected": []}, {"train": [row(split="test")]}, {"val": [], "validation": []}, {"train": {"filename": "a.jpg", "person": {"unknown": []}}}]:
        with pytest.raises(DatasetFormatError):
            parse_emotic(raw, tmp_path)
    with pytest.raises(DatasetNotReadyError):
        parse_emotic([], tmp_path / "missing")
    with pytest.raises(DatasetFormatError, match="Peace"):
        parse_emotic([row(["Happiness", "Peace"])], tmp_path, strict=True)


def test_mat_dosya_yok_bozuk_ve_hdf5_mesaji(tmp_path, monkeypatch):
    with pytest.raises(DatasetNotReadyError):
        load_emotic_mat(tmp_path / "missing.mat")
    mat = tmp_path / "broken.mat"
    mat.write_bytes(b"not a mat file")
    with pytest.raises(DatasetFormatError, match="okunamadı"):
        load_emotic_mat(mat)
    import scipy.io
    def hdf(*args, **kwargs):
        raise NotImplementedError("MATLAB 7.3")
    monkeypatch.setattr(scipy.io, "loadmat", hdf)
    with pytest.raises(DatasetFormatError, match="v7.3/HDF5"):
        load_emotic_mat(mat)


def test_mat_coklu_goruntu_kisi_ve_split_roundtrip(tmp_path):
    mat = tmp_path / "multi.mat"
    savemat(mat, {"train": np.array([
        {"filename": "a.jpg", "folder": "context", "person": np.array([
            {"body_bbox": [0, 0, 8, 8], "annotations_categories": np.array(["Happiness"], dtype=object)},
            {"body_bbox": [2, 2, 6, 6], "annotations_categories": np.array(["Fear"], dtype=object)},
        ], dtype=object)},
        {"filename": "b.jpg", "person": {"annotations_categories": np.array(["Anger"], dtype=object)}},
    ], dtype=object), "validation": {"filename": "c.jpg", "person": {"combined_categories": "Sadness"}}})
    samples = parse_emotic(load_emotic_mat(mat), tmp_path)
    assert len(samples) == 4
    assert [s.label for s in samples] == ["joy", "fear", "anger", "sadness"]
    assert [s.split for s in samples] == ["train", "train", "train", "val"]
    records = to_image_annotations(samples)
    assert len(records) == 3
    assert next(r for r in records if r.image_path.name == "a.jpg").targets == ("joy", "fear")


def test_scipy_istege_bagli_json_kullanimini_engellemez(tmp_path, monkeypatch):
    import builtins
    original = builtins.__import__
    def import_without_scipy(name, *args, **kwargs):
        if name.startswith("scipy"):
            raise ImportError("SciPy yok")
        return original(name, *args, **kwargs)
    monkeypatch.setattr(builtins, "__import__", import_without_scipy)
    (tmp_path / "annotations.json").write_text(json.dumps([
        {"image_path": "a.jpg", "labels": ["Happiness"], "split": "train"}]), encoding="utf-8")
    assert load_annotations(tmp_path)[0].targets == ("joy",)
    mat = tmp_path / "stub.mat"
    mat.write_bytes(b"unit fixture")
    with pytest.raises(DatasetNotReadyError, match="ekstra bağımlılığını"):
        load_emotic_mat(mat)


def test_nul_path_anlamli_hata(tmp_path):
    with pytest.raises(DatasetFormatError, match="NUL"):
        parse_emotic([row(path="bad\x00.jpg")], tmp_path)
