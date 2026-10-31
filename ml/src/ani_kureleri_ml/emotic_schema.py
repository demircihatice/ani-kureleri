"""MAT kapları, layout ve yalnız yapısal ön kontrol. Duygu seçimi yapmaz."""
from collections.abc import Mapping
from pathlib import Path

import numpy as np

from .dataset import DatasetFormatError, DatasetNotReadyError, resolve_image_path


def unwrap_scalar(value):
    for _ in range(64):
        if isinstance(value, np.void) and value.dtype.names:
            return {name: value[name] for name in value.dtype.names}
        if isinstance(value, np.ndarray) and value.size == 1:
            value = value.reshape(-1)[0]
        elif isinstance(value, (list, tuple)) and len(value) == 1:
            value = value[0]
        elif isinstance(value, np.generic):
            value = value.item()
        else:
            return value
    raise DatasetFormatError("MAT singleton yapısı fazla derin.")


def unwrap_string(value, field: str) -> str:
    value = unwrap_scalar(value)
    if isinstance(value, bytes):
        try:
            value = value.decode("utf-8")
        except UnicodeDecodeError as hata:
            raise DatasetFormatError(f"EMOTIC {field}: UTF-8 metin bekleniyor.") from hata
    if isinstance(value, np.ndarray) and value.dtype.kind in "US":
        chars = [c.decode("utf-8") if isinstance(c, bytes) else c for c in vector(value, field)]
        if all(isinstance(c, (str, np.str_)) and len(c) == 1 for c in chars):
            value = "".join(chars)
    if not isinstance(value, str) or not value:
        raise DatasetFormatError(f"EMOTIC {field}: tek bir metin değeri gerekli.")
    return value


def vector(value, field: str) -> list:
    """Yalnız vektör/singleton kapları açar; 2×2 matrisi 4 koordinat saymaz."""
    value = unwrap_scalar(value)
    if isinstance(value, np.ndarray):
        if value.size == 0:
            return []
        if sum(n > 1 for n in value.shape) > 1:
            raise DatasetFormatError(f"EMOTIC {field}: matris değil vektör bekleniyor.")
        return [unwrap_scalar(v) for v in value.reshape(-1)]
    if isinstance(value, (list, tuple)):
        if value and all(isinstance(v, (list, tuple)) and len(v) == 1 for v in value):
            return [unwrap_scalar(v) for v in value]
        if any(isinstance(v, (list, tuple)) and len(v) > 1 for v in value):
            raise DatasetFormatError(f"EMOTIC {field}: matris değil vektör bekleniyor.")
        return [unwrap_scalar(v) for v in value]
    return [value]


def as_records(value, context: str) -> list[Mapping]:
    value = unwrap_scalar(value)
    if isinstance(value, Mapping):
        return [value]
    rows = []
    for entry in vector(value, context):
        entry = unwrap_scalar(entry)
        if not isinstance(entry, Mapping):
            raise DatasetFormatError(f"EMOTIC {context}: adlı alanları olan nesne/liste bekleniyor.")
        rows.append(entry)
    return rows


def parse_image_size(value) -> tuple[int, int] | None:
    if value is None:
        return None
    value = unwrap_scalar(value)
    if isinstance(value, Mapping):
        if {"n_row", "n_col"} <= value.keys():
            values = [unwrap_scalar(value["n_col"]), unwrap_scalar(value["n_row"])]
        elif {"width", "height"} <= value.keys():
            values = [unwrap_scalar(value["width"]), unwrap_scalar(value["height"])]
        else:
            raise DatasetFormatError("EMOTIC image_size: n_row/n_col veya width/height bekleniyor.")
    else:
        values = vector(value, "image_size")  # Açık sözleşme: [width, height].
    if len(values) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not np.isfinite(v) or v <= 0 or int(v) != v for v in values):
        raise DatasetFormatError("EMOTIC image_size iki pozitif tam boyut içermeli.")
    return tuple(int(v) for v in values)


def resolve_emotic_image_path(dataset_root, folder, filename) -> Path:
    root = Path(dataset_root).resolve()
    images = resolve_image_path(root, "emotic")
    folder = unwrap_scalar(folder)
    folder = "" if isinstance(folder, str) and folder == "" else unwrap_string(folder, "folder")
    if folder:
        resolve_image_path(images, folder)
    filename = unwrap_string(filename, "filename")
    resolve_image_path(images, filename)
    return resolve_image_path(images, f"{folder}/{filename}" if folder else filename)


def inspect_emotic_mat(source) -> dict:
    """Dosya veya yüklenmiş Mapping → sayılar/alan adları; annotation değerlerini dökmez."""
    from .emotic import load_emotic_mat, SPLIT_ALIASES
    raw = load_emotic_mat(source) if isinstance(source, (str, Path)) else source
    raw = unwrap_scalar(raw)
    if not isinstance(raw, Mapping):
        raise DatasetFormatError("EMOTIC inspection: split Mapping gerekli.")
    summary = {"available_splits": tuple(k for k in raw if k in SPLIT_ALIASES),
               "root_fields": tuple(k for k in raw if not str(k).startswith("__")), "splits": {}}
    for split in summary["available_splits"]:
        records = as_records(raw[split], f"{split} images")
        first = records[0] if records else {}
        persons = as_records(first.get("person", first.get("persons", [])), "person")
        summary["splits"][split] = {"image_records": len(records), "first_record_field_count": len(first),
            "first_record_fields": tuple(first), "persons_in_first_image": len(persons),
            "first_person_field_count": len(persons[0]) if persons else 0,
            "first_person_fields": tuple(persons[0]) if persons else ()}
    return summary


def validate_emotic_layout(dataset_root) -> dict:
    from .emotic import load_emotic_mat, parse_emotic_layout
    root = Path(dataset_root).resolve()
    if not root.is_dir():
        raise DatasetNotReadyError(f"EMOTIC dataset bulunamadı: {root}")
    annotation = root / "Annotations" / "Annotations.mat"
    if not annotation.is_file():
        raise DatasetNotReadyError("EMOTIC Annotations/Annotations.mat bulunamadı.")
    for folder in ("ade20k", "emodb_small", "framesdb", "mscoco"):
        source = resolve_image_path(root, f"emotic/{folder}")
        if not source.is_dir():
            raise DatasetNotReadyError(f"EMOTIC image source klasörü bulunamadı: emotic/{folder}")
    raw = load_emotic_mat(annotation)
    summary = inspect_emotic_mat(raw)
    if not {"train", "val", "test"} <= set(summary["available_splits"]):
        raise DatasetFormatError("EMOTIC preflight: train/val/test split anahtarları gerekli.")
    samples = parse_emotic_layout(raw, root)
    if not samples:
        raise DatasetNotReadyError("EMOTIC preflight: parse edilebilir image/person kaydı yok.")
    return {"layout_valid": True, "total_person_annotations": len(samples),
            "missing_image_count": sum(not s.image_path.is_file() for s in samples), "schema": summary}
