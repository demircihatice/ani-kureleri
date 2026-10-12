// Hiçbir kullanıcı/veritabanı kaydı oluşturmaz; Auth ayarlarına erişimi doğrular.
const adres = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anahtar = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!adres || !anahtar?.startsWith('sb_publishable_')) {
  console.error('Bağlantı test edilmedi: .env dosyasına Project URL ve Publishable key girin.');
  process.exitCode = 1;
} else {
  try {
    const url = new URL(adres);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('Geçersiz protokol');
    }
    const yanit = await fetch(new URL('/auth/v1/settings', url), {
      headers: { apikey: anahtar },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!yanit.ok) {
      console.error(`Bağlantı doğrulanamadı (HTTP ${yanit.status}). Adresi ve anahtarı kontrol edin.`);
      process.exitCode = 1;
    } else {
      const ayarlar = await yanit.json();
      if (!ayarlar.external || typeof ayarlar.external.email !== 'boolean') {
        throw new Error('Beklenen Auth yanıtı alınamadı');
      }
      console.log('Supabase Auth bağlantısı doğrulandı. Bu kontrol giriş, tablo veya RLS testi değildir.');
    }
  } catch {
    console.error('Bağlantı doğrulanamadı. URL, internet bağlantısı ve Supabase proje durumunu kontrol edin.');
    process.exitCode = 1;
  }
}
