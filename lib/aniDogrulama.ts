import { EN_FAZLA_FOTOGRAF } from '../constants/ani';
import type { AniDuzenleme, AniFormu } from '../types/ani';

export function yerelTarih(tarih: Date): string {
  return `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, '0')}-${String(tarih.getDate()).padStart(2, '0')}`;
}

export function tarihGecerliMi(metin: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metin)) return false;
  const tarih = new Date(`${metin}T12:00:00`);
  return !Number.isNaN(tarih.getTime()) && yerelTarih(tarih) === metin;
}

export function aniDuzenlemesiniDogrula(form: AniDuzenleme, kureKimlikleri: string[]): string | null {
  if (!form.baslik.trim() || form.baslik.trim().length > 200) return 'Başlık 1–200 karakter olmalı.';
  if (form.aciklama.length > 5000) return 'Açıklama en fazla 5000 karakter olabilir.';
  if (!tarihGecerliMi(form.tarih)) return 'Geçerli bir anı tarihi seç.';
  if (!kureKimlikleri.includes(form.kureId)) return 'Sana ait bir duygu küresi seç.';
  return null;
}

export function aniFormunuDogrula(form: AniFormu, kureKimlikleri: string[]): string | null {
  const hata = aniDuzenlemesiniDogrula(form, kureKimlikleri);
  if (hata) return hata;
  if (form.fotograflar.length < 1 || form.fotograflar.length > EN_FAZLA_FOTOGRAF) return '1–5 fotoğraf seç.';
  return null;
}
