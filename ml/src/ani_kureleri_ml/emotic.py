"""MAT yükleme, kişi annotation normalizasyonu ve kişi bazlı manifest dönüşümü.

Sınıflar/mapping yalnız emotions.py'dan gelir. Bilinmeyen positional MAT şemaları
tahmin edilmez; yalnız aşağıda belgelenmiş adlı alanlar kabul edilir.
"""
from collections.abc import Mapping
from dataclasses import dataclass
import json
import math
from pathlib import Path
from types import MappingProxyType
from typing import Literal

import numpy as np

from .dataset import DatasetFormatError, DatasetNotReadyError, ImageAnnotation, resolve_image_path
from .emotions import EMOTIC_TO_PROJECT_CLASS, hedef_siniflar
from .emotic_schema import (as_records, inspect_emotic_mat, parse_image_size,
    resolve_emotic_image_path, unwrap_scalar, unwrap_string, validate_emotic_layout, vector)

SPLIT_ALIASES = MappingProxyType({"train": "train", "validation": "val", "val": "val", "test": "test"})


@dataclass(frozen=True)
class EmoticSample:
    image_path: Path
    label: str | None
    split: str
    bbox: tuple[float, float, float, float] | None
    raw_labels: tuple[str, ...]
    skip_reason: Literal["empty", "unsupported", "multilabel"] | None
    annotator_labels: tuple[str, ...] = ()
    category_source: str = "categories"
    image_size: tuple[int, int] | None = None
    person_index: int = 0
    image_record_index: int = 0


class InvalidBBoxError(DatasetFormatError):
    pass


@dataclass(frozen=True)
class EmoticParseIssue:
    reason: Literal["invalid_bbox", "schema_error"]
    scope: Literal["image", "person"]
    split: str
    image_record_index: int
    person_index: int | None
    message: str


def normalize_split(value: str) -> str:
    if not isinstance(value, str) or value not in SPLIT_ALIASES:
        raise DatasetFormatError(f"EMOTIC split tanınmıyor: {value!r}; train/val/validation/test bekleniyor.")
    return SPLIT_ALIASES[value]


def _rows(value, context: str) -> list[Mapping]:
    return as_records(value, context)


def parse_categories(value) -> tuple[str, ...]:
    value = unwrap_scalar(value)
    if isinstance(value, bytes):
        value = unwrap_string(value, "categories")
    if isinstance(value, np.ndarray) and value.dtype.kind in "US" and value.dtype.itemsize == (4 if value.dtype.kind == "U" else 1):
        value = unwrap_string(value, "categories")
    if isinstance(value, str):
        if not value or value != value.strip():
            raise DatasetFormatError("EMOTIC kategori adı boş veya çevresinde boşluk içeriyor.")
        return (value,)
    if isinstance(value, Mapping) and "categories" in value:
        return parse_categories(value["categories"])
    if isinstance(value, np.ndarray):
        value = vector(value, "categories")
    if isinstance(value, (list, tuple)):
        return tuple(label for part in value for label in parse_categories(part))
    raise DatasetFormatError("EMOTIC categories: etiket dizisi bekleniyor; sayısal kategori tahmin edilmez.")


def map_categories(categories, *, strict: bool = False) -> tuple[str, ...]:
    labels = parse_categories(categories)
    unknown = sorted(set(labels) - EMOTIC_TO_PROJECT_CLASS.keys())
    if strict and unknown:
        raise DatasetFormatError(f"Desteklenmeyen EMOTIC etiketleri: {', '.join(unknown)}")
    return hedef_siniflar(labels)


def parse_bbox(value, image_size: tuple[int, int] | None = None) -> tuple[float, float, float, float]:
    try:
        values = vector(value, "bbox")
    except DatasetFormatError as hata:
        raise InvalidBBoxError(str(hata)) from hata
    if len(values) != 4 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise InvalidBBoxError("EMOTIC bbox dört finite x1,y1,x2,y2 koordinatı içermeli.")
    x1, y1, x2, y2 = values
    if x1 < 0 or y1 < 0 or x2 <= x1 or y2 <= y1:
        raise InvalidBBoxError("EMOTIC bbox koordinat sırası geçersiz.")
    if image_size is not None and (x2 > image_size[0] or y2 > image_size[1]):
        raise InvalidBBoxError("EMOTIC bbox image_size sınırları dışında; koordinatlar kırpılmadı.")
    return tuple(values)


def load_emotic_mat(path: str | Path) -> Mapping:
    """Yalnız dosyayı yükler. v7.3/HDF5 desteklenmez; annotation yorumlamaz."""
    path = Path(path)
    if not path.is_file():
        raise DatasetNotReadyError(f"EMOTIC annotation dosyası bulunamadı: {path}")
    try:
        from scipy.io import loadmat
        from scipy.io.matlab import MatReadError
    except ImportError as hata:
        raise DatasetNotReadyError('EMOTIC MAT loading requires scipy; ml ortamına ".[mat]" ekstra bağımlılığını kur.') from hata
    try:
        return loadmat(path, simplify_cells=True, appendmat=False)
    except NotImplementedError as hata:
        raise DatasetFormatError("MATLAB v7.3/HDF5 bu aşamada desteklenmiyor; v7.2 veya daha eski MAT gerekli.") from hata
    except (OSError, ValueError, TypeError, MatReadError) as hata:
        raise DatasetFormatError(f"EMOTIC MAT dosyası okunamadı: {path}; {hata}") from hata


def _sample(row: Mapping, root: Path, split: str, *, strict: bool, image_record_index=0, person_index=0) -> EmoticSample:
    if "categories" not in row:
        raise DatasetFormatError("EMOTIC annotation entry is missing categories.")
    path = resolve_image_path(root, row.get("image_path"))
    labels = parse_categories(row["categories"])
    targets = map_categories(labels, strict=strict)
    if not targets:
        reason = "empty" if not labels else "unsupported"
    elif len(targets) > 1:
        reason = "multilabel"
    else:
        reason = None
    size = parse_image_size(row.get("image_size"))
    bbox = parse_bbox(row["bbox"], size) if row.get("bbox") is not None else None
    return EmoticSample(path, targets[0] if len(targets) == 1 else None, split, bbox, labels, reason,
        row.get("annotator_labels", ()), row.get("category_source", "categories"), size, person_index, image_record_index)


def extract_train_person(person: Mapping) -> dict:
    """Train kategorileri; combined alanı ancak eski minimal fixture fallback'idir."""
    person = unwrap_scalar(person)
    if not isinstance(person, Mapping):
        raise DatasetFormatError("EMOTIC train person: adlı alanlar gerekli.")
    field = next((f for f in ("annotations_categories", "categories", "combined_categories") if f in person), None)
    if field is None:
        raise DatasetFormatError("EMOTIC train person: categorical annotation gerekli.")
    labels = parse_categories(person[field])
    return {"categories": labels, "annotator_labels": labels, "category_source": field,
            "bbox": person.get("body_bbox", person.get("bbox"))}


def extract_eval_person(person: Mapping) -> dict:
    """EMOTIC combined kategorileri belirleyicidir; raw annotator'lardan consensus üretilmez."""
    person = unwrap_scalar(person)
    if not isinstance(person, Mapping):
        raise DatasetFormatError("EMOTIC val/test person: adlı alanlar gerekli.")
    if "combined_categories" in person:
        field = "combined_categories"
    elif "categories" in person:
        field = "categories"  # Önceden normalize edilmiş basit fixture sözleşmesi.
    else:
        raise DatasetFormatError("EMOTIC val/test person: combined_categories gerekli; raw annotator listesi tek başına yeterli değil.")
    return {"categories": parse_categories(person[field]),
            "annotator_labels": parse_categories(person["annotations_categories"]) if "annotations_categories" in person else (),
            "category_source": field, "bbox": person.get("body_bbox", person.get("bbox"))}


def parse_emotic(raw, dataset_root: str | Path, *, strict: bool = False,
                 real_layout: bool = False, issues: list[EmoticParseIssue] | None = None) -> tuple[EmoticSample, ...]:
    """Her image+person ayrı sample. issues verilirse schema/bbox hataları toplanır.

    Varsayılan genel görüntü kökü sözleşmesi korunur; real_layout=True köke emotic/ ekler.
    Unsupported/empty/multilabel kararları extraction'dan bağımsız mevcut policy'dir.
    """
    root = Path(dataset_root).resolve()
    if not root.is_dir():
        raise DatasetNotReadyError(f"EMOTIC dataset bulunamadı: {root}")
    images = resolve_image_path(root, "emotic") if real_layout else root
    samples = []
    image_index = 0

    def report(hata, split, image_id, person_id=None):
        if issues is None:
            raise hata
        issues.append(EmoticParseIssue("invalid_bbox" if isinstance(hata, InvalidBBoxError) else "schema_error",
            "image" if person_id is None else "person", split, image_id, person_id, str(hata)))

    def parse_entry(entry: Mapping, split: str, image_id: int):
        if "split" in entry and normalize_split(unwrap_string(entry["split"], "split")) != split:
            raise DatasetFormatError("EMOTIC entry split'i üst split ile çelişiyor.")
        if "person" not in entry and "persons" not in entry:
            if "filename" in entry:
                raise DatasetFormatError("EMOTIC image record: person alanı gerekli.")
            samples.append(_sample(entry, images, split, strict=strict, image_record_index=image_id))
            return
        if "filename" not in entry:
            raise DatasetFormatError("EMOTIC annotation entry is missing image path (filename).")
        filename = unwrap_string(entry["filename"], "filename")
        raw_folder = unwrap_scalar(entry.get("folder", ""))
        folder = "" if isinstance(raw_folder, str) and raw_folder == "" else unwrap_string(raw_folder, "folder")
        resolve_image_path(images, filename)
        if folder:
            resolve_image_path(images, folder)
        relative = f"{folder}/{filename}" if folder else filename
        size = parse_image_size(entry.get("image_size"))
        people = unwrap_scalar(entry.get("person", entry.get("persons")))
        people = [people] if isinstance(people, Mapping) else vector(people, "persons")
        if not people:
            raise DatasetFormatError("EMOTIC person listesi boş; kişi bilgisi gerekli.")
        for person_id, person in enumerate(people):
            try:
                person = unwrap_scalar(person)
                if not isinstance(person, Mapping):
                    raise DatasetFormatError("EMOTIC person: adlı alanları olan nesne gerekli.")
                extracted = extract_train_person(person) if split == "train" else extract_eval_person(person)
                if real_layout and extracted["bbox"] is None:
                    raise InvalidBBoxError("EMOTIC gerçek layout person kaydında bbox gerekli.")
                samples.append(_sample({**extracted, "image_path": relative, "image_size": size}, images, split,
                    strict=strict, image_record_index=image_id, person_index=person_id))
            except DatasetFormatError as hata:
                report(hata, split, image_id, person_id)

    def process(entries, split):
        nonlocal image_index
        entries = unwrap_scalar(entries)
        entries = [entries] if isinstance(entries, Mapping) else vector(entries, f"{split} entries")
        for entry in entries:
            current = image_index
            image_index += 1
            try:
                entry = unwrap_scalar(entry)
                if not isinstance(entry, Mapping):
                    raise DatasetFormatError("EMOTIC image record: adlı alanları olan nesne gerekli.")
                parse_entry(entry, split, current)
            except DatasetFormatError as hata:
                is_flat = isinstance(entry, Mapping) and "image_path" in entry and "person" not in entry and "persons" not in entry
                report(hata, split, current, 0 if is_flat else None)

    raw = unwrap_scalar(raw)
    if isinstance(raw, Mapping) and "split" not in raw:
        keys = [key for key in raw if not str(key).startswith("__")]
        if not keys or any(key not in SPLIT_ALIASES for key in keys):
            raise DatasetFormatError("EMOTIC MAT kökünde train/val/validation/test adlı split alanları bekleniyor.")
        if "val" in keys and "validation" in keys:
            raise DatasetFormatError("EMOTIC kökünde hem val hem validation var; split belirsiz.")
        for key in keys:
            process(raw[key], normalize_split(key))
    else:
        for entry in _rows(raw, "entries"):
            if "split" not in entry:
                raise DatasetFormatError("EMOTIC annotation entry is missing split.")
            process(entry, normalize_split(unwrap_string(entry["split"], "split")))
    return tuple(samples)


def parse_emotic_layout(raw, dataset_root: str | Path, **kwargs) -> tuple[EmoticSample, ...]:
    return parse_emotic(raw, dataset_root, real_layout=True, **kwargs)


def to_person_annotations(samples: tuple[EmoticSample, ...]) -> tuple[ImageAnnotation, ...]:
    return tuple(ImageAnnotation(s.image_path, s.raw_labels, s.split, (s.bbox,) if s.bbox is not None else (),
        person_index=s.person_index, image_record_index=s.image_record_index, image_size=s.image_size,
        sample_id=f"{s.image_record_index}:{s.person_index}") for s in samples)


def to_image_annotations(samples: tuple[EmoticSample, ...]) -> tuple[ImageAnnotation, ...]:
    """Eski açık görüntü özeti API'si. Dataset/audit/export kişi yolunda bunu KULLANMAZ."""
    grouped = {}
    for sample in samples:
        labels, boxes = grouped.setdefault((sample.image_path, sample.split), (set(), []))
        labels.update(sample.raw_labels)
        if sample.bbox is not None:
            boxes.append(sample.bbox)
    return tuple(ImageAnnotation(path, tuple(sorted(labels)), split, tuple(boxes))
                 for (path, split), (labels, boxes) in sorted(grouped.items()))


def export_manifest(samples: tuple[EmoticSample, ...], dataset_root: str | Path, output: str | Path) -> int:
    """Kabul edilen her kişiyi ayrı yazar; aynı fotoğraftaki farklı duygular çelişki değildir."""
    root = Path(dataset_root).resolve()
    rows = []
    for sample in samples:
        if not sample.image_path.is_relative_to(root):
            raise DatasetFormatError("Manifest görüntüsü dataset kökünden çıkamaz.")
        if sample.skip_reason is not None:
            continue
        rows.append({"image_path": sample.image_path.relative_to(root).as_posix(), "labels": list(sample.raw_labels),
            "label": sample.label, "split": sample.split, "bboxes": [list(sample.bbox)] if sample.bbox is not None else [],
            "sample_level": "person", "person_index": sample.person_index, "image_record_index": sample.image_record_index,
            "sample_id": f"{sample.image_record_index}:{sample.person_index}",
            "image_size": list(sample.image_size) if sample.image_size else None,
            "annotator_labels": list(sample.annotator_labels), "category_source": sample.category_source})
    output = Path(output)
    try:
        with output.open("x", encoding="utf-8") as stream:
            json.dump(rows, stream, ensure_ascii=False, indent=2)
    except FileExistsError as hata:
        raise DatasetFormatError("Manifest çıktı dosyası zaten var; mevcut dosyanın üzerine yazılmadı.") from hata
    return len(rows)
