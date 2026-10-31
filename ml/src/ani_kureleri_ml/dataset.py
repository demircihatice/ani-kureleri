"""Eski JSON ve yeni person manifest adaptörü; MAT okuması emotic.py'ya devredilir.

Gelecekte gerçek EMOTIC annotation'larından dışa aktarılacak manifest okunur.
Yalnız eski düz JSON satırları görüntü düzeyinde birleşir; MAT/person kayıtları ayrı kalır.
"""
from dataclasses import dataclass
import json
from pathlib import Path, PurePosixPath

from PIL import Image, UnidentifiedImageError
from torch.utils.data import Dataset

from .emotions import CLASS_TO_INDEX, hedef_siniflar
from .preprocessing import validation_transform


class DatasetNotReadyError(RuntimeError):
    pass


class DatasetFormatError(ValueError):
    pass


def resolve_image_path(root: str | Path, relative: str) -> Path:
    """JSON ve MAT adaptörlerinin ortak, platform bağımsız yol sınırı."""
    root = Path(root).resolve()
    if not isinstance(relative, str) or not relative.strip():
        raise DatasetFormatError("EMOTIC annotation entry is missing image path.")
    if "\x00" in relative:
        raise DatasetFormatError("Görüntü yolu NUL karakteri içeremez.")
    posix = PurePosixPath(relative.replace("\\", "/"))
    path = (root / str(posix)).resolve()
    if posix.is_absolute() or ":" in relative or ".." in posix.parts or not path.is_relative_to(root):
        raise DatasetFormatError("Görüntü yolu dataset kökünden çıkamaz.")
    return path


@dataclass(frozen=True)
class ImageAnnotation:
    image_path: Path
    labels: tuple[str, ...]
    split: str
    bboxes: tuple[tuple[float, float, float, float], ...] = ()
    person_index: int | None = None
    image_record_index: int | None = None
    image_size: tuple[int, int] | None = None
    sample_id: str | None = None

    @property
    def targets(self) -> tuple[str, ...]:
        return hedef_siniflar(self.labels)


def load_annotations(root: str | Path, annotations: str | Path | None = None) -> tuple[ImageAnnotation, ...]:
    root = Path(root).resolve()
    manifest = Path(annotations) if annotations is not None else root / "annotations.json"
    if manifest.suffix.lower() == ".mat":
        from .emotic import load_emotic_mat, parse_emotic, to_person_annotations
        real_layout = (root / "emotic").is_dir() and (root / "Annotations").is_dir()
        return to_person_annotations(parse_emotic(load_emotic_mat(manifest), root, real_layout=real_layout))
    if not root.is_dir() or not manifest.is_file():
        raise DatasetNotReadyError(f"EMOTIC dataset bulunamadı. Görüntü klasörü ve JSON manifest gerekli: {root}")
    try:
        records = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as hata:
        raise DatasetFormatError("EMOTIC manifest okunamadı; UTF-8 JSON bekleniyor.") from hata
    if not isinstance(records, list):
        raise DatasetFormatError("Manifest bir JSON satır listesi olmalı.")
    if not records:
        raise DatasetNotReadyError("EMOTIC dataset bulunamadı. Manifest boş.")
    grouped: dict[tuple[Path, str], set[str]] = {}
    boxes: dict[tuple[Path, str], list[tuple[float, float, float, float]]] = {}
    persons = {}
    for i, row in enumerate(records, 1):
        if not isinstance(row, dict):
            raise DatasetFormatError(f"Manifest satır {i}: nesne bekleniyor.")
        relative, labels, split = row.get("image_path"), row.get("labels"), row.get("split", "unspecified")
        if not isinstance(relative, str) or not relative.strip():
            raise DatasetFormatError(f"Manifest satır {i}: image_path gerekli.")
        image_path = resolve_image_path(root, relative)
        if not isinstance(labels, list) or any(not isinstance(e, str) or not e.strip() or e != e.strip() for e in labels):
            raise DatasetFormatError(f"Manifest satır {i}: labels boşluk içermeyen etiket dizisi olmalı.")
        if split not in ("train", "val", "test", "unspecified"):
            raise DatasetFormatError(f"Manifest satır {i}: split train/val/test/unspecified olmalı.")
        if row.get("sample_level") == "person":
            from .emotic import parse_bbox
            from .emotic_schema import parse_image_size
            identity, person_id, image_id = row.get("sample_id"), row.get("person_index"), row.get("image_record_index")
            if not isinstance(identity, str) or not identity or any(isinstance(v, bool) or not isinstance(v, int) or v < 0 for v in (person_id, image_id)):
                raise DatasetFormatError(f"Manifest satır {i}: person sample kimliği geçersiz.")
            size = parse_image_size(row.get("image_size"))
            raw_boxes = row.get("bboxes", [])
            if not isinstance(raw_boxes, list) or len(raw_boxes) > 1:
                raise DatasetFormatError(f"Manifest satır {i}: person için en fazla bir bbox olmalı.")
            record = ImageAnnotation(image_path, tuple(labels), split, tuple(parse_bbox(b, size) for b in raw_boxes),
                person_id, image_id, size, identity)
            key = (image_path, split, identity)
            if key in persons and persons[key] != record:
                raise DatasetFormatError(f"Manifest satır {i}: aynı person/sample için çelişen kayıt.")
            persons[key] = record
            continue
        grouped.setdefault((image_path, split), set()).update(labels)
        if "bboxes" in row:
            from .emotic import parse_bbox
            if not isinstance(row["bboxes"], list):
                raise DatasetFormatError(f"Manifest satır {i}: bboxes liste olmalı.")
            boxes.setdefault((image_path, split), []).extend(parse_bbox(b) for b in row["bboxes"])
    legacy = tuple(ImageAnnotation(path, tuple(sorted(labels)), split, tuple(boxes.get((path, split), ())))
                   for (path, split), labels in sorted(grouped.items()))
    return legacy + tuple(persons.values())


class EmoticDataset(Dataset):
    def __init__(self, root: str | Path, annotations: str | Path | None = None, *, split: str | None = None, transform=None):
        records = load_annotations(root, annotations)
        if split is not None and split not in ("train", "val", "test", "unspecified"):
            raise ValueError("Geçersiz split.")
        self.samples = tuple(r for r in records if len(r.targets) == 1 and (split is None or r.split == split))
        if not self.samples:
            raise DatasetNotReadyError("EMOTIC dataset hazır değil: seçilen split içinde tek hedefli görüntü yok.")
        for record in self.samples:
            if not record.image_path.is_file():
                raise DatasetNotReadyError(f"EMOTIC görüntüsü bulunamadı: {record.image_path}")
        self.transform = transform if transform is not None else validation_transform()

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        record = self.samples[index]
        try:
            with Image.open(record.image_path) as image:
                tensor = self.transform(image)
        except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as hata:
            raise DatasetNotReadyError(f"EMOTIC görüntüsü okunamadı: {record.image_path}") from hata
        return tensor, CLASS_TO_INDEX[record.targets[0]]
