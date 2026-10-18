import { supabaseIstemcisiniAl } from '../lib/supabase';

export class ApiHatasi extends Error {
  constructor(mesaj: string, public durum: number | null, public belirsiz: boolean) {
    super(mesaj);
    this.name = 'ApiHatasi';
  }
}

type ApiSecenekleri = {
  yontem?: 'GET' | 'POST' | 'PATCH';
  govde?: unknown;
  sinyal?: AbortSignal;
};

function apiAdresi(yol: string): string {
  const adres = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!adres || !yol.startsWith('/v1/')) throw new ApiHatasi('Backend adresi veya API yolu geçersiz.', null, false);
  let url: URL;
  try { url = new URL(adres); } catch { throw new ApiHatasi('Backend adresi geçersiz.', null, false); }
  const h = url.hostname;
  const yerel = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' ||
    /^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(h) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && yerel && process.env.NODE_ENV !== 'production'))) {
    throw new ApiHatasi('Backend adresi güvenli değil. Production için HTTPS kullanın.', null, false);
  }
  return adres.replace(/\/+$/, '') + yol;
}

export async function apiIstegi<T>(yol: string, secenekler: ApiSecenekleri = {}): Promise<T> {
  const adres = apiAdresi(yol);
  const yontem = secenekler.yontem ?? 'GET';
  const yazma = yontem !== 'GET';
  const istemci = supabaseIstemcisiniAl();
  let oturum;
  try { oturum = await istemci.auth.getSession(); }
  catch { throw new ApiHatasi('Oturum okunamadı. Yeniden giriş yapın.', 401, false); }
  const session = oturum.data.session;
  if (oturum.error || !session?.access_token) throw new ApiHatasi('Giriş yapmanız gerekiyor.', 401, false);
  const userId = session.user.id;
  const iptal = new AbortController();
  const iptalEt = () => iptal.abort();
  const zamanAsimi = setTimeout(iptalEt, 15000);
  secenekler.sinyal?.addEventListener('abort', iptalEt, { once: true });
  if (secenekler.sinyal?.aborted) iptal.abort();
  try {
    const yanit = await fetch(adres, {
      method: yontem, headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(secenekler.govde !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: secenekler.govde !== undefined ? JSON.stringify(secenekler.govde) : undefined,
      signal: iptal.signal, redirect: 'error',
    });
    if (!yanit.ok) {
      const mesaj = yanit.status === 401 ? 'Oturum geçersiz. Yeniden giriş yapın.' :
        yanit.status === 404 ? 'Kayıt bulunamadı.' : yanit.status === 409 ? 'Kayıt değişmiş veya aynı kimlik farklı içerikle kullanılmış.' :
          yanit.status === 422 ? 'Gönderilen alanları kontrol edin.' : 'İstek tamamlanamadı. Tekrar deneyin.';
      throw new ApiHatasi(mesaj, yanit.status, yazma && yanit.status >= 500);
    }
    const veri: T = await yanit.json();
    const sonOturum = await istemci.auth.getSession();
    if (sonOturum.error || sonOturum.data.session?.user.id !== userId) {
      throw new ApiHatasi('İstek sırasında oturum değişti.', 401, yazma);
    }
    return veri;
  } catch (hata) {
    if (hata instanceof ApiHatasi) throw hata;
    throw new ApiHatasi('Bağlantı veya yanıt doğrulanamadı. Aynı isteği yeniden deneyebilirsiniz.', null, yazma);
  } finally {
    clearTimeout(zamanAsimi);
    secenekler.sinyal?.removeEventListener('abort', iptalEt);
  }
}

export function apiBaglantisiniDogrula(): void { apiAdresi('/v1/memories'); }
