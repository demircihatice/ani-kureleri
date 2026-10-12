import type { GirisBilgileri, KayitBilgileri } from '../types/auth';

export function girisBilgileriniDogrula({ eposta, sifre }: GirisBilgileri): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta.trim())) {
    return 'Geçerli bir e-posta adresi girin.';
  }
  if (!sifre) return 'Şifrenizi girin.';
  return null;
}

export function kayitBilgileriniDogrula(bilgiler: KayitBilgileri): string | null {
  const ad = bilgiler.adSoyad.trim();
  if (ad.length < 2 || ad.length > 100) return 'Ad soyad 2–100 karakter olmalı.';
  const hata = girisBilgileriniDogrula(bilgiler);
  if (hata) return hata;
  if (bilgiler.sifre.length < 8) return 'En az 8 karakterli bir şifre belirleyin.';
  if (bilgiler.sifre.length > 128) return 'Şifre en fazla 128 karakter olabilir.';
  return null;
}

export function authHataMesaji(hata: unknown): string {
  const kod = typeof hata === 'object' && hata !== null && 'code' in hata ? hata.code : undefined;
  switch (kod) {
    case 'invalid_credentials': return 'E-posta veya şifre hatalı.';
    case 'email_not_confirmed': return 'Giriş yapmadan önce e-postanıza gelen doğrulama bağlantısını açın.';
    case 'user_already_exists': case 'email_exists': return 'Bu e-posta ile bir hesap mevcut. Giriş yapmayı deneyin.';
    case 'weak_password': return 'Şifre güvenlik koşullarını karşılamıyor. Daha uzun, büyük/küçük harf, sayı ve sembol içeren bir şifre deneyin.';
    case 'email_address_invalid': return 'Bu e-posta adresi kabul edilmedi. Adresi kontrol edin.';
    case 'email_address_not_authorized': return 'Test e-postası gönderilemiyor. Proje yöneticisi Supabase e-posta gönderim ayarlarını kontrol etmeli.';
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Çok fazla deneme yapıldı. Bir süre bekleyip tekrar deneyin.';
    case 'signup_disabled': return 'Yeni kayıt şu anda kapalı. Proje yöneticisiyle iletişime geçin.';
    case 'request_timeout': return 'İstek zaman aşımına uğradı. Bağlantınızı kontrol edip tekrar deneyin.';
  }
  if (hata instanceof TypeError || (hata instanceof Error && /fetch|network/i.test(hata.message))) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }
  // Sunucunun ham yanıtlarını veya oturum bilgilerini ekrana/loglara yazmayız.
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
}
