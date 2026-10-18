import { randomUUID } from 'expo-crypto';
import { supabaseIstemcisiniAl } from '../lib/supabase';
import { FOTO_BUCKET } from '../constants/ani';
import { fotografiHazirla, galeridenSec } from './photoService';
import type { SecilenFotograf } from '../types/ani';

export function profilYoluGecerli(kullaniciId: string, yol: unknown): yol is string {
  if (!kullaniciId || typeof yol !== 'string') return false;
  const bolumler = yol.split('/');
  return bolumler.length === 3 && bolumler[0] === kullaniciId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bolumler[1]) && bolumler[2] === '0.jpg';
}
export async function profilFotografiSec() {
  return (await galeridenSec(1))?.[0] ?? null;
}
export async function profilFotografiUrl(kullaniciId: string, yol: unknown) {
  if (!profilYoluGecerli(kullaniciId, yol)) return null;
  const { data, error } = await supabaseIstemcisiniAl().storage.from(FOTO_BUCKET).createSignedUrl(yol, 600);
  if (error || !data?.signedUrl) throw new Error('Profil fotoğrafın yüklenemedi. Tekrar deneyebilirsin.');
  return data.signedUrl;
}
export async function guncelProfilFotografi(kullaniciId: string) {
  if (!kullaniciId) return null;
  const {data, error} = await supabaseIstemcisiniAl().auth.getUser();
  if (error || data.user?.id !== kullaniciId) throw new Error('Profil fotoğrafı bilgisi alınamadı.');
  return profilFotografiUrl(kullaniciId, data.user.user_metadata.avatar_path);
}
export async function profilFotografiniKaydet(kullaniciId: string, fotograf: SecilenFotograf): Promise<string> {
  const istemci = supabaseIstemcisiniAl();
  const once = await istemci.auth.getUser();
  if (once.error || once.data.user?.id !== kullaniciId) throw new Error('Oturum değişti. Yeniden giriş yap.');
  const eskiYol: unknown = once.data.user.user_metadata.avatar_path;
  // Mevcut özel bucket ve kullanıcı/UUID/0.jpg politikası kullanılır; anı kaydı oluşturulmaz.
  const yol = `${kullaniciId}/${randomUUID()}/0.jpg`;
  const bucket = istemci.storage.from(FOTO_BUCKET);
  const veri = await fotografiHazirla(fotograf, 512);
  const { error: yuklemeHatasi } = await bucket.upload(yol, veri, { contentType: 'image/jpeg', upsert: false });
  if (yuklemeHatasi) {
    try { await bucket.remove([yol]); } catch { /* Auth kaydı henüz yapılmadı; asıl fotoğraf korunur. */ }
    throw new Error('Profil fotoğrafın yüklenemedi. Tekrar dene.');
  }
  const guncel = await istemci.auth.getUser();
  if (guncel.error || guncel.data.user?.id !== kullaniciId) throw new Error('Oturum değişti. Fotoğraf kaydı tamamlanamadı.');
  let kayit;
  try { kayit = await istemci.auth.updateUser({ data: { avatar_path: yol } }); }
  catch { throw new Error('Profil fotoğrafı kaydı doğrulanamadı. Profili yenileyip kontrol et.'); }
  if (kayit.error || kayit.data.user?.id !== kullaniciId || kayit.data.user.user_metadata.avatar_path !== yol) {
    // Yanıt kaybolmuş olabilir: yeni dosyayı silip kayıtlı avatarı boşa düşürmeyiz.
    throw new Error('Profil fotoğrafı kaydı doğrulanamadı. Profili yenileyip kontrol et.');
  }
  if (profilYoluGecerli(kullaniciId, eskiYol) && eskiYol !== yol) {
    // Anıya bağlı dosyalar mevcut DELETE politikasıyla ayrıca korunur.
    try { await bucket.remove([eskiYol]); } catch { /* Eski dosya temizliği yeni fotoğrafı bozmaz. */ }
  }
  return yol;
}
