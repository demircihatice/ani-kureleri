import json

import numpy as np
from PIL import Image
import pytest
from scipy.io import savemat

from ani_kureleri_ml.dataset import DatasetFormatError, DatasetNotReadyError, EmoticDataset, load_annotations
from ani_kureleri_ml.dataset_audit import audit_dataset, audit_emotic_samples, main
from ani_kureleri_ml.emotic import (InvalidBBoxError, export_manifest, extract_train_person,
    extract_eval_person, inspect_emotic_mat, parse_bbox, parse_emotic, parse_emotic_layout,
    resolve_emotic_image_path, validate_emotic_layout)


def cell(value):
    result = np.empty((1, 1), dtype=object)
    result[0, 0] = value
    return result


def cells(values):
    result = np.empty((1, len(values)), dtype=object)
    for index, value in enumerate(values):
        result[0, index] = value
    return result


def person(label="Happiness", bbox=(0, 0, 8, 8), **extra):
    return {"body_bbox": cell(np.array([bbox], dtype=float)), "annotations_categories": cell(label), **extra}


def image(people, name="scene.png", **extra):
    return {"filename": name, "folder": "mscoco", "image_size": {"n_row": 8, "n_col": 16}, "person": people, **extra}


def layout(root, *, keys=("train", "val", "test"), missing_source=None, empty=False):
    for source in ("ade20k", "emodb_small", "framesdb", "mscoco"):
        if source != missing_source:
            (root / "emotic" / source).mkdir(parents=True)
    (root / "Annotations").mkdir()
    if missing_source != "mscoco":
        Image.new("RGB", (16, 8)).save(root / "emotic" / "mscoco" / "scene.png")
    raw = {key: np.array([], dtype=object) for key in keys}
    if not empty:
        raw["train"] = image(person())
    savemat(root / "Annotations" / "Annotations.mat", raw)


def test_real_split_keys_ve_layout_path(tmp_path):
    raw = {"train": image(person()), "val": image(person(combined_categories=["Sadness"])),
           "test": image(person(combined_categories=["Fear"]))}
    samples = parse_emotic_layout(raw, tmp_path)
    assert [s.split for s in samples] == ["train", "val", "test"]
    assert [s.label for s in samples] == ["joy", "sadness", "fear"]
    assert all(s.image_path == tmp_path / "emotic" / "mscoco" / "scene.png" for s in samples)
    assert resolve_emotic_image_path(tmp_path, cell("mscoco"), cell("scene.png")) == samples[0].image_path


def test_train_extraction_raw_kullanir(tmp_path):
    p = person("Anger", combined_categories=["Happiness"], annotations_continuous={"valence": 4}, gender="Female", age="Adult")
    extracted = extract_train_person(cell(p))
    assert extracted["categories"] == ("Anger",)
    sample, = parse_emotic_layout({"train": image(p)}, tmp_path)
    assert sample.label == "anger" and sample.category_source == "annotations_categories"


@pytest.mark.parametrize("split", ["val", "test"])
def test_eval_combined_raw_onceligi(split, tmp_path):
    p = person(cells([{"categories": ["Surprise"]}, {"categories": ["Fear"]}]),
               combined_categories=cells(["Happiness", "Engagement"]))
    assert extract_eval_person(cell(p))["categories"] == ("Happiness", "Engagement")
    sample, = parse_emotic_layout({split: image(p)}, tmp_path)
    assert sample.label == "joy" and sample.annotator_labels == ("Surprise", "Fear")
    assert sample.category_source == "combined_categories"


@pytest.mark.parametrize("combined,reason", [(["Happiness", "Surprise"], "multilabel"), ([], "empty"), (["Peace"], "unsupported")])
def test_combined_tek_etikete_zorlanmaz(tmp_path, combined, reason):
    sample, = parse_emotic_layout({"val": image(person("Happiness", combined_categories=combined))}, tmp_path)
    assert sample.label is None and sample.skip_reason == reason


def test_eval_raw_only_consensus_uydurmaz(tmp_path):
    with pytest.raises(DatasetFormatError, match="combined_categories"):
        parse_emotic_layout({"val": image(person())}, tmp_path)


def test_nested_strings_bbox_size_ve_struct(tmp_path):
    filename = cell(np.array(list("scene.png"), dtype="U1"))
    p = cell(person(cell(np.array(list("Happiness"), dtype="U1"))))
    record = np.empty((1, 1), dtype=[("filename", object), ("folder", object), ("image_size", object), ("person", object)])
    record["filename"][0, 0] = filename
    record["folder"][0, 0] = cell("mscoco")
    record["image_size"][0, 0] = cell({"n_row": cell(np.int64(8)), "n_col": cell(np.int64(16))})
    record["person"][0, 0] = p
    sample, = parse_emotic_layout({"train": cell(record)}, tmp_path)
    assert sample.label == "joy" and sample.bbox == (0, 0, 8, 8) and sample.image_size == (16, 8)
    assert sample.image_path.name == "scene.png"


def test_ayni_image_farkli_bbox_duygu_iki_gecerli_sample(tmp_path):
    layout(tmp_path, empty=True)
    raw = {"train": image(cells([person("Happiness", (0, 0, 8, 8)), person("Sadness", (8, 0, 16, 8))]))}
    samples = parse_emotic_layout(raw, tmp_path)
    assert [s.label for s in samples] == ["joy", "sadness"]
    assert [s.person_index for s in samples] == [0, 1]
    manifest = tmp_path / "persons.json"
    assert export_manifest(samples, tmp_path, manifest) == 2
    records = load_annotations(tmp_path, manifest)
    assert len(records) == 2 and [r.targets for r in records] == [("joy",), ("sadness",)]
    assert records[0].bboxes != records[1].bboxes
    dataset = EmoticDataset(tmp_path, manifest)
    assert len(dataset) == 2 and [dataset[i][1] for i in range(2)] == [2, 4]
    report = audit_dataset(tmp_path, manifest)
    assert report.total_image_records == 1 and report.total_person_annotations == 2
    assert not report.duplicate_groups and not report.split_leakage


@pytest.mark.parametrize("bbox", [np.array([[0, 0], [4, 4]]), [0, 0, 17, 8], [0, 0, 8, 9], [0, 0, np.inf, 4], [1, 1, 1, 8]])
def test_invalid_bbox_shape_ve_size_sinir(tmp_path, bbox):
    with pytest.raises(InvalidBBoxError, match="bbox"):
        parse_emotic_layout({"train": image(person(bbox=bbox))}, tmp_path)


def test_bbox_missing_real_layout_ve_helpers():
    for extraction in (extract_train_person, extract_eval_person):
        with pytest.raises(DatasetFormatError, match="person"):
            extraction(42)
    assert parse_bbox(cell(np.array([[0], [0], [8], [8]])), (16, 8)) == (0, 0, 8, 8)


def test_inspection_yalniz_yapi_ozeti(tmp_path):
    raw = {"train": cell(image(cells([person(), person("Sadness")]), name="PRIVATE_FILENAME.png")),
           "val": [], "test": []}
    summary = inspect_emotic_mat(raw)
    assert summary["available_splits"] == ("train", "val", "test")
    assert summary["splits"]["train"]["image_records"] == 1
    assert summary["splits"]["train"]["persons_in_first_image"] == 2
    assert summary["splits"]["train"]["first_record_field_count"] == 4
    assert summary["splits"]["train"]["first_person_field_count"] == 2
    assert "PRIVATE_FILENAME" not in str(summary) and "Happiness" not in str(summary)


def test_preflight_valid_layout_ve_cli(tmp_path, capsys):
    layout(tmp_path)
    report = validate_emotic_layout(tmp_path)
    assert report["layout_valid"] and report["total_person_annotations"] == 1 and report["missing_image_count"] == 0
    assert main(["--root", str(tmp_path), "--inspect"]) == 0
    assert "available_splits" in capsys.readouterr().out
    assert main(["--root", str(tmp_path), "--preflight"]) == 0
    assert '"layout_valid": true' in capsys.readouterr().out


def test_preflight_missing_root_ve_annotations(tmp_path):
    with pytest.raises(DatasetNotReadyError, match="dataset bulunamadı"):
        validate_emotic_layout(tmp_path / "missing")
    with pytest.raises(DatasetNotReadyError, match="Annotations.mat"):
        validate_emotic_layout(tmp_path)


@pytest.mark.parametrize("keys", [("train", "test"), ("train", "validation", "test")])
def test_preflight_missing_real_val_split(tmp_path, keys):
    layout(tmp_path, keys=keys)
    with pytest.raises(DatasetFormatError, match="train/val/test"):
        validate_emotic_layout(tmp_path)


def test_preflight_source_missing_ve_empty_annotations(tmp_path):
    missing = tmp_path / "missing"
    missing.mkdir()
    layout(missing, missing_source="framesdb")
    with pytest.raises(DatasetNotReadyError, match="framesdb"):
        validate_emotic_layout(missing)
    empty = tmp_path / "empty"
    empty.mkdir()
    layout(empty, empty=True)
    with pytest.raises(DatasetNotReadyError, match="parse edilebilir"):
        validate_emotic_layout(empty)


def test_audit_schema_bbox_ayri_sayilir(tmp_path):
    raw = {"train": [image(cells([person(), person(bbox=(1, 0, 0, 8)), {"body_bbox": [0, 0, 4, 4]}, 99])),
                     {"filename": "malformed.png"}, 77]}
    issues = []
    samples = parse_emotic_layout(raw, tmp_path, issues=issues)
    report = audit_emotic_samples(samples, tuple(issues))
    assert report.total_image_records == 3
    assert report.total_person_annotations == 4 and report.accepted_person_samples == 1 and report.skipped_person_samples == 3
    assert report.invalid_bbox_count == 1 and report.schema_error_count == 4
    assert report.class_counts["joy"] == 1 and report.missing_image_count == 1


def test_same_person_manifest_conflict_reddedilir(tmp_path):
    samples = parse_emotic([{"image_path": "a.png", "categories": ["Happiness"], "split": "train"}], tmp_path)
    output = tmp_path / "samples.json"
    export_manifest(samples, tmp_path, output)
    rows = json.loads(output.read_text(encoding="utf-8"))
    rows.append({**rows[0], "labels": ["Sadness"]})
    output.write_text(json.dumps(rows), encoding="utf-8")
    with pytest.raises(DatasetFormatError, match="çelişen"):
        load_annotations(tmp_path, output)
