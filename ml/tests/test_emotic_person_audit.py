import json

import numpy as np
from PIL import Image
from scipy.io import savemat

from ani_kureleri_ml.dataset_audit import audit_dataset, main
from ani_kureleri_ml.emotions import EMOTIC_TO_PROJECT_CLASS


def test_mat_person_audit_tum_siniflar_ve_bbox_hatasi(tmp_path, capsys):
    (tmp_path / "emotic" / "mscoco").mkdir(parents=True)
    (tmp_path / "Annotations").mkdir()
    Image.new("RGB", (8, 8)).save(tmp_path / "emotic" / "mscoco" / "a.png")
    people = [{"body_bbox": [0, 0, 8, 8], "annotations_categories": label} for label in EMOTIC_TO_PROJECT_CLASS]
    people.append({"body_bbox": [0, 0, 9, 8], "annotations_categories": "Happiness"})
    raw = {"train": {"filename": "a.png", "folder": "mscoco", "image_size": {"width": 8, "height": 8},
                     "person": np.array(people, dtype=object)}, "val": [], "test": []}
    mat = tmp_path / "Annotations" / "Annotations.mat"
    savemat(mat, raw)
    report = audit_dataset(tmp_path, mat)
    assert report.total_image_records == 1 and report.total_person_annotations == 8
    assert report.accepted_person_samples == 7 and report.skipped_person_samples == 1
    assert report.annotation_audit.invalid_bbox_count == 1
    assert report.annotation_audit.schema_error_count == 0
    assert not report.missing_classes and not report.unreadable_images and not report.duplicate_groups
    assert all(count == 1 for count in report.class_counts.values())
    assert main(["--root", str(tmp_path), "--annotations", str(mat)]) == 1
    data = json.loads(capsys.readouterr().out)
    assert data["annotation_audit"]["invalid_bbox_count"] == 1
