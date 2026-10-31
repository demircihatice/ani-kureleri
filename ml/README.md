# Aşama 18.1–18.3 — Bağımsız ML ve EMOTIC altyapısı

7 sınıflı transfer learning model altyapısı ve veri hazırlama hattı hazırlandı.
Bu aşama gerçek eğitim, accuracy ölçümü veya çalışan duygu tahmini değildir.
Dataset/pretrained ağırlık indirilmedi. Mobil UI, FastAPI, Supabase ve cihazlarla
entegrasyon yoktur. A18.3 kişi bazlı şema uyumluluğu ve ön kontrol katmanıdır.

## Kurulum (proje kökünden, PowerShell)

Python 3.12–3.14 ile backend'den ayrı `ml/.venv` kullanılır. Bu makinede Python
3.13 ve CPU paketleri kurulmuştur; GPU gerekmez.

```powershell
python -m venv ml/.venv
ml/.venv/Scripts/python.exe -m pip install torch==2.11.0 torchvision==0.26.0 --index-url https://download.pytorch.org/whl/cpu
ml/.venv/Scripts/python.exe -m pip install -e "./ml[test,mat]"
ml/.venv/Scripts/python.exe -m pytest ml/tests -q
```

Kurulum internete ihtiyaç duyar, testler duymaz. Windows Store Python ensurepip
geçici klasör izin hatasında yazılabilir geçici klasör veya sistem pip'inden
`python -m pip --python ml/.venv install pip` kullanılabilir.
`requirements-tested.txt` test edilen ortamın tam sürümlerini içerir.
SciPy yalnız isteğe bağlı `[mat]` ekstra bağımlılığıdır; MAT dosyalarını güvenilir
biçimde açmak için kullanılır. JSON yolu SciPy gerektirmez. Tüm testler için
`[test,mat]` kurulur. OpenCV/scikit-learn eklenmedi; backend ortamı değiştirilmedi.

## Merkezi sınıf sözleşmesi: emotions.py

| Index | Model | Türkçe | EMOTIC |
|---|---|---|---|
| 0 | anger | Öfke | Anger |
| 1 | shame | Utanç | Embarrassment |
| 2 | joy | Neşe | Happiness |
| 3 | disgust | Tiksinti | Aversion |
| 4 | sadness | Üzüntü | Sadness |
| 5 | surprise | Şaşkınlık | Surprise |
| 6 | fear | Korku | Fear |

Tuple ve MappingProxyType ile sabit tutulur. `alexithymia` model sınıfı değildir;
ileride backend fallback'i olabilir. Bu aşamada fallback üretilmez.
Embarrassment→shame ve Aversion→disgust proje etiket eşleştirmeleridir;
evrensel psikolojik eşdeğerlik iddiası değildir.

## Preprocessing ve ResNet18

Validation/inference: EXIF yönü → RGB → kısa kenar 256 bilinear resize → merkez
224×224 crop → float32 tensor → ImageNet mean `(0.485, 0.456, 0.406)` ve std
`(0.229, 0.224, 0.225)`. Validation random değildir. Training hattında ayrıca
RandomResizedCrop, yatay flip, ±8 derece dönüş ve hafif ColorJitter vardır.

`create_model(weights=None, freeze_backbone=True)` gerçek torchvision ResNet18'i
sarar, `fc` katmanını `Linear(512,7)` yapar. `model.fc` son katmana erişir;
state_dict anahtarları `backbone.*` ile başlar. Çıktı logits'tir, tahmin/güven
kararı değildir. `weights=None` çevrimdışı çalışır. İleride açıkça
`weights=ResNet18_Weights.IMAGENET1K_V1` seçilirse ImageNet ağırlığı kullanılabilir;
önbellekte yoksa torchvision indirebilir. Bu aşamada ağırlık indirilmedi.

Freeze=True: backbone gradient'leri kapalı, yeni fc eğitilebilir. `train()`
çağrısında da backbone BatchNorm istatistikleri sabittir. Freeze=False: tüm
parametreler eğitilebilir. `eval()` iki modda da korunur. Gerçek forward-pass
smoke testi rastgele `(2,3,224,224)` batch için `(2,7)` çıktıyı kontrol eder;
bu prediction veya accuracy değildir. Gradient testi de unit testtir; optimizer
adımı, eğitim döngüsü, checkpoint veya eğitilmiş model yoktur.

## Dataset adapter sözleşmesi ve sınırı

Gerçek EMOTIC sağlanmadı. `ml/data` yalnız `.gitkeep` içerir ve Git'ten hariçtir;
dataset/annotation dosyalarını repoya commit etme. EMOTIC gerçek bağlam içeren
fotoğraflarla yedi sınıflı baseline hazırlamak için hedeflenmektedir.

A18.3 `emotic.py` iki katman içerir: `load_emotic_mat(path)` SciPy `loadmat` ile
`simplify_cells=True` kullanır; `parse_emotic(raw, dataset_root, strict=False)`
Python/Mapping/list/numpy kaplarını normalleştirir. MATLAB v7.3/HDF5 desteklenmez.
Yalnız açık named-field sözleşmesi desteklenir; positional indeks tahmin edilmez:

- Flat kayıt: `image_path`, `categories`, `split`, opsiyonel `bbox`.
- Split kökü: `train/val/validation/test` → `filename`, opsiyonel `folder`, `person`.
- Train kişi extraction: `annotations_categories` (veya basit `categories`) kullanılır.
  Yalnız eski minimal fixture uyumluluğu için tek `combined_categories` alanı da kabul edilir.
- Val/test: `combined_categories` varsa boş olsa bile belirleyicidir. Raw annotator
  listeleriyle birleştirilmez, yeni consensus uydurulmaz. Raw kategoriler metadata'da
  `annotator_labels` olarak saklanır. Önceden normalize `categories` basit fixture'ları
  korunur; yalnız raw annotator alanı olan val/test kaydı hata verir.
- `EmoticSample`: `image_path`, `label`, `split`, `bbox`, `raw_labels`, `skip_reason`.
  Koordinatlar `(x1,y1,x2,y2)` olarak değiştirilmeden saklanır, crop yapılmaz.
  Yeni metadata: `person_index`, `image_record_index`, `image_size`, `category_source`,
  `annotator_labels`. `raw_labels`, seçilen annotation kaynağının etiketleridir.
- `0 hedef → empty/unsupported skip`, `1 hedef → kabul`, `2+ → multilabel skip`.
  Case-sensitive mapping mevcut `emotions.py`dan gelir. Non-strict hedef dışı
  etiketleri sayar/atlar; strict mod bunlara anlamlı hata verir.
- `validation→val`, diğer split'ler aynı kalır. Random split veya shuffle yapılmaz.

```python
from ani_kureleri_ml.emotic import load_emotic_mat, parse_emotic_layout, export_manifest

samples = parse_emotic_layout(load_emotic_mat(annotation_path), dataset_root)
export_manifest(samples, dataset_root, output_manifest_path)
```

Bu argümanlar gerçek dosyalar sağlandığında verilir; kullanıcıya özel sabit yol yoktur.
Export kabul edilen her kişiyi ayrı JSON satırı olarak saklar. Aynı fotoğrafta farklı
bbox ve duygular geçerlidir; image conflict sayılmaz. `sample_level=person`, kimlikler
ve bbox korunur; mevcut çıktı üzerine yazılmaz. Model girdisinde kişi crop'u henüz
yapılmadığından eğitim öncesi kişi/context girdisi ayrıca kararlaştırılmalıdır.

Gerçek annotation şeması henüz dosya üzerinden doğrulanmadı. Veri geldiğinde önce
alan adları incelenip sözleşmeyle karşılaştırılmalıdır; bilinmeyen şema hata verir.

`EmoticDataset(root, annotations=None, split=None, transform=None)`:

- Varsayılan manifest `root/annotations.json`; alternatif JSON veya `.mat` yolu verilebilir.
- JSON liste içindeki nesne alanları: `image_path: str`, `labels: list[str]`,
  opsiyonel `split: train|val|test|unspecified`.
  Dönüştürücü ayrıca `label` ve `bboxes` yazar; adapter bbox'ları saklar, mevcut
  `labels` tabanlı hedef belirleme davranışı değişmez.
- Görüntü yolu dataset köküne göre relatiftir. Mutlak yol, `..` ve kök dışına
  çıkan symlink reddedilir. Etiket adları orijinal büyük/küçük harfleriyle kullanılır.
- Eski düz JSON'da görüntü/split birleştirmesi korunur. Yeni person manifesti ve MAT
  girişinde her kişi ayrı kalır; aynı sample kimliğiyle çelişen JSON satırı reddedilir.
  Eski açık `to_image_annotations()` özet helper'ı uyumluluk için durur; yeni
  dataset/audit/export akışı onu kullanmaz, `to_person_annotations()` kullanır.
- Tam bir benzersiz hedef varsa alınır; hedef dışı etiketler yanında tek hedef
  kabul edilir. Birden fazla hedef `ambiguous` raporlanıp dışlanır; sıfır hedef
  de dışlanır. Rastgele label/fallback yoktur, yüz/kişi crop'u üretilmez.
- Klasör/manifest/uygun görüntü yoksa DatasetNotReadyError; format bozuksa
  DatasetFormatError. Eksik dosya doluymuş gibi kabul edilmez.

Özgün split bilgileri korunur; kişi veya görüntü bazında yeniden bölme yapılmaz.

## Expected EMOTIC layout

```text
<root>/
├── emotic/
│   ├── ade20k/
│   ├── emodb_small/
│   ├── framesdb/
│   └── mscoco/
└── Annotations/
    └── Annotations.mat
```

`parse_emotic_layout(raw, root)` görüntüyü `root/emotic/folder/filename` olarak
çözer. Eski genel `parse_emotic(raw, image_root)` sözleşmesi korunur. MAT okuyan
dataset/audit, kökte `emotic/` ve `Annotations/` varsa standart layout'u tanır.
Mutlak kullanıcı yolu sabitlenmez; traversal ve kök dışı symlink reddedilir.

Image size `n_row/n_col` veya `width/height` adlı alanlardan, ayrıca açık `[width,height]`
vektör sözleşmesinden okunur. Bbox dört finite koordinat ve `x2>x1, y2>y1` gerektirir.
Bilinen image size dışına çıkan veya matris biçimindeki bbox hata verir, clamp edilmez.
Gerçek layout kişi kaydında bbox zorunludur; eski flat fixture'da opsiyonel kalır.

Gerçek veri geldiğinde ilk adım eğitim değildir:

```powershell
ml/.venv/Scripts/python.exe -m ani_kureleri_ml.dataset_audit --root ml/data/emotic --inspect
ml/.venv/Scripts/python.exe -m ani_kureleri_ml.dataset_audit --root ml/data/emotic --preflight
ml/.venv/Scripts/python.exe -m ani_kureleri_ml.dataset_audit --root ml/data/emotic --annotations ml/data/emotic/Annotations/Annotations.mat
```

Buradaki root'u gerçek dataset konumuyla değiştir. `inspect_emotic_mat(path)` yalnız
split/record/person sayıları ile ilk kayıtların alan adlarını döndürür, değerleri dump
etmez. `validate_emotic_layout(root)` dört kaynak klasörünü, annotation dosyasını,
train/val/test anahtarlarını, şema/bbox doğruluğunu ve en az bir parse edilebilir
kaydı kontrol eder. Eksik dosya sayısını raporlar; görüntü okunabilirliği sonraki
audit'te doğrulanır. Preflight başarısı eğitim/veri kalitesi onayı değildir.

## Audit ve duplicate/hash

```powershell
ml/.venv/Scripts/python.exe -m ani_kureleri_ml.dataset_audit --root ml/data/emotic
# Gerçek annotation geldiğinde: --annotations gerçek/Annotations.mat ekle.
```

Dataset yoksa `EMOTIC dataset bulunamadı.` ve exit code 2 döner. Audit dosya/etiket
değiştirmez, split oluşturmaz. Rapor alanları:

- `total_samples`: eski JSON'da görüntü/split; yeni MAT/person manifestinde kişi örnek sayısı.
- `class_counts`: tek hedefli annotation sayıları; `eligible_counts`: ayrıca
  dosyası okunabilen tek hedefli örnekler. `missing_classes`: eligible sayısı sıfır.
- `unmapped_labels`, `ambiguous_count`, `no_target_count`.
- `unreadable_image_count`, `unreadable_images`: eksik/bozuk görüntüler.
- `duplicate_groups`: dosya byte'ları için aynı SHA-256.
- `split_leakage`: aynı hash'in train/val/test'ten en az iki farklı split'te olması.

MAT girişinde ek `annotation_audit` kişi bazında toplam/kabul/skip sayıları,
multilabel/unsupported/empty skip nedenleri, tüm ve kabul edilen split sayıları,
sınıf sayıları, unsupported etiketler ve eksik image path sayısını içerir.
`audit_emotic_samples(samples)` aynı raporu doğrudan parser çıktısından üretir.
Yeni `total_image_records`, `total_person_annotations`, `accepted_person_samples`,
`skipped_person_samples` alanları görüntü ve kişi metriklerini ayırır. `invalid_bbox_count`
ve `schema_error_count` ayrı tutulur; bozuk image kaydında kişi sayısı uydurulmaz.
Audit `issues` toplayarak bozuk kayıtları raporlar; normal parser fail-fast kalır.
Kabul sayısı etiket uygunluğudur; dosya eksikliği ayrıca sayılır. Eski JSON audit
alanları ve API'si korunur; bu girişte `annotation_audit=None` olur.

Hash bloklar halinde hesaplanır; aynı dosya/kopya aynı hash'i verir. Yeniden
sıkıştırılmış yakın kopya tespiti/perceptual hash yoktur. `unspecified` leakage
kanıtı değildir; duplicate olarak kalır. Eksik sınıf, bozuk görüntü veya leakage
varsa exit code 1, temiz raporda 0. Bbox/schema hatası da exit code 1 üretir.
Aynı fotoğraftaki farklı kişiler duplicate sayılmaz; hash her path/split için
bir kez kaydedilir, farklı split'te aynı görüntü hâlâ leakage olarak işaretlenir.
Eğitimden önce rapor incelenmelidir.

Testte programatik PIL görüntüleri ve geçici parser girdileri yalnız unit test
içindir; EMOTIC annotation'ı veya eğitim seti olarak sunulmaz, `ml/data`ya yazılmaz.
Testler ağ/model ağırlığı indirme girişimini hata sayar.

## Aşama 18.1 doğrulama sonucu

25 Ekim 2026: **33 test geçti**, skip yok. Python 3.13, torch 2.11.0+cpu,
torchvision 0.26.0+cpu, Pillow 12.3.0, numpy 2.5.4, pytest 9.1.1 kullanıldı.
Gerçek forward-pass çıktı boyutu `(2,7)`; preprocessing `(3,224,224)` ve finite.
Dataset bulunamadı denetimi beklenen kontrollü hatayı verdi. Gerçek dataset
kullanılmadı, eğitim yapılmadı ve pretrained ağırlık indirilmedi.

A18.2 doğrulaması: **70 test geçti**, skip yok; önceki 33 test bu toplamda
korundu. SciPy 1.18.1 ile yalnız minimal sentetik MAT fixture'ları okundu;
gerçek EMOTIC şeması/dosyasıyla doğrulama ve eğitim henüz yapılmadı.

A18.3: **95 test geçti** (70 önceki senaryo + 25 yeni). Combined/raw union ve
image-conflict beklentileri istenen düzeltmeye uyarlandı. Nested object/structured
array, train/eval extraction, kişi manifest round-trip, inspection, preflight ve
audit hata kodları yalnız sentetik fixture'larla doğrulandı. Gerçek veri henüz yoktur.

## Kaynaklar

- [Resmî EMOTIC deposu](https://github.com/rkosti/emotic)
- [Resmî annotation açıklaması](https://s3.sunai.uoc.edu/emotic/annotations.html)
- [Resmî depodan bağlantı verilen MAT dönüşüm referansı](https://github.com/Tandon-A/emotic/blob/master/mat2py.py)
- [SciPy loadmat ve sürüm sınırları](https://docs.scipy.org/doc/scipy/reference/generated/scipy.io.loadmat.html)
- [ResNet18/preprocessing](https://docs.pytorch.org/vision/stable/models/generated/torchvision.models.resnet18.html)
- [PyTorch CPU sürümleri](https://pytorch.org/get-started/previous-versions/#v2110)
