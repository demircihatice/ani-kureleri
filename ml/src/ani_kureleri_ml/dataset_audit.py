"""Dataseti değiştirmeden görüntü düzeyinde etiket, dosya ve hash raporu."""
import argparse
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from .dataset import DatasetFormatError, DatasetNotReadyError, load_annotations
from .emotions import EMOTION_CLASSES, EMOTIC_TO_PROJECT_CLASS
from .emotic import EmoticSample, EmoticParseIssue, load_emotic_mat, parse_emotic, to_person_annotations


def image_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


@dataclass(frozen=True)
class EmoticAuditReport:
    total_samples: int
    accepted_count: int
    skipped_count: int
    multilabel_skipped_count: int
    unsupported_skipped_count: int
    empty_skipped_count: int
    split_counts: dict[str, int]
    accepted_split_counts: dict[str, int]
    class_counts: dict[str, int]
    missing_image_count: int
    unsupported_labels: dict[str, int]
    total_image_records: int = 0
    total_person_annotations: int = 0
    accepted_person_samples: int = 0
    skipped_person_samples: int = 0
    invalid_bbox_count: int = 0
    schema_error_count: int = 0
    parse_issues: tuple[EmoticParseIssue, ...] = ()


def audit_emotic_samples(samples: tuple[EmoticSample, ...], issues: tuple[EmoticParseIssue, ...] = ()) -> EmoticAuditReport:
    """Kişi annotation sayıları; dosya varlığı etiket kabul kararından bağımsız raporlanır."""
    splits = dict.fromkeys(("train", "val", "test"), 0)
    accepted_splits = splits.copy()
    counts = dict.fromkeys(EMOTION_CLASSES, 0)
    reasons = Counter()
    unknown = Counter()
    missing = 0
    for sample in samples:
        splits[sample.split] += 1
        unknown.update(set(sample.raw_labels) - EMOTIC_TO_PROJECT_CLASS.keys())
        if sample.skip_reason is None:
            counts[sample.label] += 1
            accepted_splits[sample.split] += 1
        else:
            reasons[sample.skip_reason] += 1
        missing += not sample.image_path.is_file()
    accepted = sum(counts.values())
    invalid_persons = [issue for issue in issues if issue.scope == "person"]
    for issue in invalid_persons:
        splits[issue.split] += 1
    total = len(samples) + len(invalid_persons)
    images = {(s.split, s.image_record_index) for s in samples} | {(i.split, i.image_record_index) for i in issues}
    return EmoticAuditReport(total, accepted, total - accepted,
        reasons["multilabel"], reasons["unsupported"], reasons["empty"], splits,
        accepted_splits, counts, missing, dict(sorted(unknown.items())), len(images), total, accepted,
        total - accepted, sum(i.reason == "invalid_bbox" for i in issues),
        sum(i.reason == "schema_error" for i in issues), tuple(issues))


@dataclass(frozen=True)
class AuditReport:
    total_samples: int
    class_counts: dict[str, int]
    unmapped_labels: dict[str, int]
    ambiguous_count: int
    no_target_count: int
    missing_classes: tuple[str, ...]
    unreadable_image_count: int
    unreadable_images: tuple[str, ...]
    duplicate_groups: tuple[dict, ...]
    split_leakage: tuple[dict, ...]
    eligible_counts: dict[str, int]
    annotation_audit: EmoticAuditReport | None = None
    total_image_records: int = 0
    total_person_annotations: int | None = None
    accepted_person_samples: int | None = None
    skipped_person_samples: int | None = None


def audit_dataset(root: str | Path, annotations: str | Path | None = None) -> AuditReport:
    annotation_audit = None
    if annotations is not None and Path(annotations).suffix.lower() == ".mat":
        issues = []
        real_layout = (Path(root) / "emotic").is_dir() and (Path(root) / "Annotations").is_dir()
        samples = parse_emotic(load_emotic_mat(annotations), root, real_layout=real_layout, issues=issues)
        records = to_person_annotations(samples)
        annotation_audit = audit_emotic_samples(samples, tuple(issues))
    else:
        records = load_annotations(root, annotations)
    counts = dict.fromkeys(EMOTION_CLASSES, 0)
    eligible = dict.fromkeys(EMOTION_CLASSES, 0)
    unmapped: Counter = Counter()
    ambiguous = no_target = 0
    broken = []
    hashes = defaultdict(list)
    image_cache = {}
    hash_entries = set()
    for record in records:
        targets = record.targets
        unmapped.update(e for e in record.labels if e not in EMOTIC_TO_PROJECT_CLASS)
        if len(targets) > 1:
            ambiguous += 1
        elif not targets:
            no_target += 1
        else:
            counts[targets[0]] += 1
        if record.image_path not in image_cache:
            try:
                with Image.open(record.image_path) as image:
                    image.verify()
                with Image.open(record.image_path) as image:
                    image.load()
                image_cache[record.image_path] = image_sha256(record.image_path)
            except (OSError, UnidentifiedImageError, Image.DecompressionBombError):
                image_cache[record.image_path] = None
                broken.append(str(record.image_path))
        digest = image_cache[record.image_path]
        if digest is not None:
            identity = (record.image_path, record.split)
            if identity not in hash_entries:
                hashes[digest].append({"path": str(record.image_path), "split": record.split})
                hash_entries.add(identity)
            if len(targets) == 1:
                eligible[targets[0]] += 1
    duplicates = tuple({"sha256": digest, "images": images} for digest, images in sorted(hashes.items()) if len(images) > 1)
    leakage = tuple(group for group in duplicates if len({r["split"] for r in group["images"]} - {"unspecified"}) > 1)
    image_count = annotation_audit.total_image_records if annotation_audit else len({(r.image_path, r.split, r.image_record_index) for r in records})
    person_count = annotation_audit.total_person_annotations if annotation_audit else sum(r.person_index is not None for r in records) or None
    accepted_persons = annotation_audit.accepted_person_samples if annotation_audit else sum(r.person_index is not None and len(r.targets) == 1 for r in records) if person_count else None
    return AuditReport(len(records), counts, dict(sorted(unmapped.items())), ambiguous, no_target,
        tuple(c for c in EMOTION_CLASSES if eligible[c] == 0), len(broken), tuple(broken), duplicates, leakage, eligible, annotation_audit,
        image_count, person_count, accepted_persons, person_count - accepted_persons if person_count is not None else None)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="EMOTIC görüntü/etiket denetimi; eğitim yapmaz.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "emotic")
    parser.add_argument("--annotations", type=Path)
    parser.add_argument("--inspect", action="store_true", help="Yalnız MAT alan/sayı özeti")
    parser.add_argument("--preflight", action="store_true", help="Standart EMOTIC layout ön kontrolü")
    args = parser.parse_args(argv)
    try:
        if args.inspect:
            from .emotic_schema import inspect_emotic_mat
            path = args.annotations if args.annotations else args.root / "Annotations" / "Annotations.mat"
            print(json.dumps(inspect_emotic_mat(path), ensure_ascii=False, indent=2))
            return 0
        if args.preflight:
            from .emotic_schema import validate_emotic_layout
            print(json.dumps(validate_emotic_layout(args.root), ensure_ascii=False, indent=2))
            return 0
        report = audit_dataset(args.root, args.annotations)
    except (DatasetNotReadyError, DatasetFormatError) as hata:
        print(str(hata))
        return 2
    print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
    # Sorunlu audit temiz rapormuş gibi başarı koduyla dönmez; veriyi değiştirmez.
    issues = report.annotation_audit
    return 1 if report.unreadable_image_count or report.split_leakage or report.missing_classes or (issues and (issues.invalid_bbox_count or issues.schema_error_count)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
