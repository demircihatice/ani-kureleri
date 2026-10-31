# Anı Küreleri

Anı Küreleri; mobil uygulama, görüntü tabanlı duygu sınıflandırma ve NFC destekli fiziksel bir küreyi bir araya getiren bir projedir.

Hedeflenen akışta kullanıcı mobil uygulamadan fotoğraf/anı ekler. Fotoğraf yapay zekâ modeli tarafından analiz edilerek yedi duygu sınıfından biriyle ilişkilendirilir. Tek fiziksel küre, NFC etkileşimi sonrasında analiz sırasında beyaz ışıkla, analiz tamamlandığında ilgili duygu rengiyle geri bildirim verir. Bu model ve donanım akışı henüz uçtan uca uygulanmış değildir.

## Teknolojiler

| Katman | Teknolojiler |
|---|---|
| Mobil | React Native, Expo, TypeScript |
| Backend | FastAPI, Python, JWT authentication |
| Veritabanı | PostgreSQL, SQLAlchemy, Alembic |
| Makine öğrenmesi | Python, PyTorch, Transfer Learning, EMOTIC dataset entegrasyon altyapısı |
| Planlanan donanım | ESP32, NFC, RGB LED |

Backend, FastAPI üzerinden bağımsız geliştiriliyor ve veritabanı katmanında PostgreSQL hedefleniyor. Projede geçmiş Supabase migration dosyaları korunmaktadır; temel backend ve kimlik doğrulama mimarisi FastAPI, JWT ve PostgreSQL üzerine geliştirilmektedir.

## Duygu sınıfları

Öfke · Utanç · Neşe · Tiksinti · Üzüntü · Şaşkınlık · Korku

`alexithymia` model sınıfı değildir; güvenli karar verilemediğinde backend tarafında kullanılacak fallback olarak ayrılmıştır.

## Güncel durum

- Mobil uygulama arayüzü ve anı akışları geliştiriliyor.
- FastAPI, JWT doğrulama ve PostgreSQL erişim altyapısı mevcut.
- ML/veri hazırlama altyapısı A18.1–A18.3 kapsamında hazırlandı.
- EMOTIC veri erişimi bekleniyor.
- Tek fiziksel kürenin ESP32 + NFC + RGB LED entegrasyonu geliştirilecek.

## ML ve veri hazırlama

- Yedi çıkışlı ResNet18 transfer learning model altyapısı hazırlandı.
- EMOTIC annotation parser, person-level annotation ve bounding box desteği eklendi.
- Train/val/test splitleri korunuyor; val/test için combined categorical annotation kullanılıyor.
- Dataset audit, schema inspection ve preflight kontrolleri hazırlandı.
- EMOTIC veri setine resmî erişim talebi gönderildi.
- Gerçek dataset repoya eklenmemiştir ve eklenmeyecektir.
- Veri geldiğinde önce schema inspection, preflight ve dataset audit çalıştırılacaktır.
- Gerçek veri doğrulanmadan model eğitimi başlatılmadı; şu an bir accuracy/F1 sonucu raporlanmıyor.

Kurulum, veri dizini, testler ve parser ayrıntıları: [ML README](ml/README.md).

Güncel test kontrolü: ML **95 geçti**, backend **187 geçti / 8 canlı veritabanı testi atlandı**, mobil **115 geçti**. ML doğrulaması sentetik fixture'larla yapıldı; gerçek dataset başarımını göstermez.

## Geliştirme

Mobil uygulama için `npm ci` ve `npm start` kullanılır. `.env.example` dosyasından yerel `.env` oluşturulur; gerçek erişim bilgileri Git'e eklenmez. Backend ve ML ayrı Python sanal ortamlarında çalıştırılır. Backend ayarları `backend/.env.example`, bağımlılıkları `backend/pyproject.toml` içindedir.

```text
src/app/      Mobil ekranlar
components/   Ortak arayüz bileşenleri
services/     Mobil veri servisleri
backend/      FastAPI, PostgreSQL ve Alembic altyapısı
ml/           Model ve EMOTIC veri hazırlama modülü
supabase/     Geçiş sürümünün geçmiş SQL migration dosyaları
```

Dataset, annotation dosyaları, model ağırlıkları, sanal ortamlar ve gizli ayarlar kaynak kod deposuna dahil edilmez.
