# Anı Küreleri

Anı Küreleri; mobil uygulama, görüntü tabanlı duygu sınıflandırma ve NFC destekli fiziksel bir küreyi bir araya getiren bir projedir.

Hedeflenen akışta kullanıcı mobil uygulamadan fotoğraf/anı ekler. Fotoğraf yapay zekâ modeli tarafından analiz edilerek yedi duygu sınıfından biriyle ilişkilendirilir. Fiziksel küre, NFC etkileşimi sonrasında analiz sırasında beyaz ışıkla, analiz tamamlandığında ilgili duygu rengiyle geri bildirim verir. Bu model ve donanım akışı henüz uçtan uca uygulanmış değildir.

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
- EMOTIC veri erişimi bekleniyor.
- Tek fiziksel kürenin ESP32 + NFC + RGB LED entegrasyonu geliştirilecek.

## Geliştirme

```text
src/app/      Mobil ekranlar
components/   Ortak arayüz bileşenleri
services/     Mobil veri servisleri
backend/      FastAPI, PostgreSQL ve Alembic altyapısı
ml/           Model ve EMOTIC veri hazırlama modülü
supabase/     Geçiş sürümünün geçmiş SQL migration dosyaları
```

Dataset, annotation dosyaları, model ağırlıkları, sanal ortamlar ve gizli ayarlar kaynak kod deposuna dahil edilmez.
