import { supabaseIstemcisiniAl } from '../lib/supabase';
import { ANI_SAYFA_BOYUTU, FOTO_BUCKET } from '../constants/ani';
import { fotografiHazirla } from './photoService';
import type { AniDenemesi, AniListeSatiri, AniSayfasi, AniDetaySatiri, AniDetayi, AniDuzenleme, AniGuncellenen } from '../types/ani';
import { aniDuzenlemesiniDogrula } from '../lib/aniDogrulama';

export class AniKayitHatasi extends Error {
  constructor(mesaj: string, public belirsiz: boolean) { super(mesaj); }
}

// Yeni arayüzde yalnızca metin/tarih düzenlenir; duygu ve sphere_id değişmez.
export async function aniBilgileriniGuncelle(kullaniciId: string, aniId: string,
  form: Omit<AniDuzenleme, 'kureId'>): Promise<AniGuncellenen> {
  if (!kullaniciId || !aniId) throw new Error('Giriş ve anı kimliği gerekli.');
  const hata = aniDuzenlemesiniDogrula({ ...form, kureId: 'koru' }, ['koru']);
  if (hata) throw new Error(hata);
  const { data, error } = await supabaseIstemcisiniAl().from('memories')
    .update({ title: form.baslik.trim(), description: form.aciklama.trim() || null, memory_date: form.tarih })
    .eq('id', aniId).eq('user_id', kullaniciId)
    .select('id, title, description, memory_date, sphere_id').returns<AniGuncellenen[]>().single();
  if (error || !data) throw new Error('Değişiklikler doğrulanamadı. Anıyı yenileyip tekrar dene.');
  return data;
}

export async function aniDetayiniGetir(kullaniciId: string, aniId: string, sinyal: AbortSignal): Promise<AniDetayi> {
  if (!kullaniciId || !aniId) throw new Error('Giriş ve anı kimliği gerekli.');
  const istemci = supabaseIstemcisiniAl();
  const { data, error } = await istemci.from('memories')
    .select('id, title, description, memory_date, sphere_id, image_url, memory_images(id, storage_path, sort_order)')
    .eq('user_id', kullaniciId).eq('id', aniId)
    .order('sort_order', { referencedTable: 'memory_images', ascending: true })
    .abortSignal(sinyal).returns<AniDetaySatiri[]>().maybeSingle();
  if (error) throw new Error('Anı yüklenemedi. Bağlantını kontrol edip tekrar dene.');
  if (!data) throw new Error('Anı bulunamadı veya hesabına ait değil.');
  if (sinyal.aborted) throw new Error('İstek iptal edildi.');
  const yollar = data.memory_images.length ? data.memory_images.map((f) => f.storage_path) : [data.image_url];
  let fotograflar: AniDetayi['fotograflar'] = yollar.map((yol) => ({ yol, url: null }));
  try {
    const sonuc = await istemci.storage.from(FOTO_BUCKET).createSignedUrls(yollar, 600);
    if (!sonuc.error) fotograflar = yollar.map((yol) => {
      const imza = sonuc.data?.find((f) => f.path === yol);
      return { yol, url: imza && !imza.error ? imza.signedUrl : null };
    });
  } catch { /* Fotoğraf hatası anının metin alanlarını gizlemez. */ }
  return { id: data.id, title: data.title, description: data.description,
    memory_date: data.memory_date, sphere_id: data.sphere_id, fotograflar };
}

export async function aniyiGuncelle(kullaniciId: string, aniId: string, form: AniDuzenleme, kureKimlikleri: string[]): Promise<AniGuncellenen> {
  if (!kullaniciId || !aniId) throw new Error('Giriş ve anı kimliği gerekli.');
  const hata = aniDuzenlemesiniDogrula(form, kureKimlikleri);
  if (hata) throw new Error(hata);
  const { data, error } = await supabaseIstemcisiniAl().from('memories')
    .update({ title: form.baslik.trim(), description: form.aciklama.trim() || null,
      memory_date: form.tarih, sphere_id: form.kureId })
    .eq('id', aniId).eq('user_id', kullaniciId)
    .select('id, title, description, memory_date, sphere_id')
    .returns<AniGuncellenen[]>().single();
  if (error || !data) {
    if (error?.code === '42501') throw new Error('Bu anıyı düzenleyemezsin veya seçilen küre hesabına ait değil.');
    if (error?.code === 'PGRST116') throw new Error('Anı bulunamadı veya hesabına ait değil.');
    throw new Error('Güncelleme doğrulanamadı. Bağlantını kontrol edip aynı değişiklikleri tekrar kaydet.');
  }
  return data;
}

async function dosyalariTemizle(yollar: string[]): Promise<boolean> {
  try {
    const { error } = await supabaseIstemcisiniAl().storage.from(FOTO_BUCKET).remove(yollar);
    return !error;
  } catch { return false; }
}

export async function aniyiKaydet(deneme: AniDenemesi, ilerleme: (mesaj: string) => void): Promise<string> {
  const istemci = supabaseIstemcisiniAl();
  const { data: { session } } = await istemci.auth.getSession();
  if (!session || session.user.id !== deneme.kullaniciId) throw new AniKayitHatasi('Oturum değişti. Kendi hesabınla yeniden giriş yap.', false);
  if (!deneme.yuklemeTamam) {
    const denenmisYollar: string[] = [];
    try {
      for (let i = 0; i < deneme.form.fotograflar.length; i++) {
        ilerleme(`Fotoğraf ${i + 1}/${deneme.form.fotograflar.length} yükleniyor…`);
        const veri = await fotografiHazirla(deneme.form.fotograflar[i]);
        denenmisYollar.push(deneme.yollar[i]);
        const { error } = await istemci.storage.from(FOTO_BUCKET).upload(deneme.yollar[i], veri,
          { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
      }
      deneme.yuklemeTamam = true;
    } catch (sorun) {
      const temiz = !denenmisYollar.length || await dosyalariTemizle(denenmisYollar);
      const mesaj = sorun instanceof Error && sorun.message.includes('6 MB')
        ? sorun.message : 'Fotoğraflar yüklenemedi. İnternet bağlantını ve Storage kurulumunu kontrol edip tekrar dene.';
      throw new AniKayitHatasi(mesaj + (temiz ? '' : ' Yarım yüklenen dosyalar temizlenemedi; panelden kontrol gerekebilir.'), false);
    }
  }
  ilerleme('Anı kaydediliyor…');
  // Tek RPC = anı ve tüm fotoğraf satırları tek PostgreSQL transaction'ında.
  let sonuc;
  try {
    sonuc = await istemci.rpc('ani_olustur', {
      p_id: deneme.id, p_sphere_id: deneme.form.kureId, p_title: deneme.form.baslik.trim(),
      p_description: deneme.form.aciklama.trim() || null, p_memory_date: deneme.form.tarih,
      p_paths: deneme.yollar,
    });
  } catch {
    throw new AniKayitHatasi('Kayıt sonucu doğrulanamadı. Alanları değiştirmeden aynı kaydı tekrar dene.', true);
  }
  if (!sonuc.error && sonuc.data === deneme.id) return deneme.id;
  if (!sonuc.error) throw new AniKayitHatasi('Kayıt sonucu doğrulanamadı. Aynı kaydı tekrar dene.', true);
  // Sunucudan gelen PostgreSQL/şema hatası transaction'ın başarısız olduğunu gösterir.
  const kesinHata = /^[0-9A-Z]{5}$/.test(sonuc.error.code ?? '') || /^PGRST/.test(sonuc.error.code ?? '');
  if (kesinHata) {
    const temiz = await dosyalariTemizle(deneme.yollar);
    throw new AniKayitHatasi('Anı kaydedilemedi. Küre seçimini ve Aşama 6 SQL kurulumunu kontrol edip tekrar dene.' +
      (temiz ? '' : ' Yüklenen dosyalar temizlenemedi; panelden kontrol gerekebilir.'), false);
  }
  // Yanıt kaybolmuş olabilir: dosyaları silmeyiz ve tekrar denemede aynı UUID'yi kullanırız.
  throw new AniKayitHatasi('Kayıt sonucu doğrulanamadı. İnternet bağlantını açıp aynı kaydı tekrar dene.', true);
}

export async function kureAnilariniGetir(kullaniciId: string, kureId: string, sinyal: AbortSignal, baslangic = 0): Promise<AniSayfasi> {
  if (!kullaniciId || !kureId || !Number.isInteger(baslangic) || baslangic < 0) throw new Error('Kullanıcı, küre ve sayfa bilgisi gerekli.');
  const istemci = supabaseIstemcisiniAl();
  const { data, error, count } = await istemci.from('memories')
    .select('id, title, memory_date, image_url, memory_images(storage_path, sort_order)', { count: 'exact' })
    .eq('user_id', kullaniciId).eq('sphere_id', kureId)
    .order('memory_date', { ascending: false }).order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .order('sort_order', { referencedTable: 'memory_images', ascending: true })
    .limit(1, { referencedTable: 'memory_images' })
    // range uçları dahil: fazladan bir kayıt, sonraki sayfa olup olmadığını gösterir.
    .range(baslangic, baslangic + ANI_SAYFA_BOYUTU)
    .abortSignal(sinyal).returns<AniListeSatiri[]>();
  if (error) throw error;
  if (sinyal.aborted) throw new Error('İstek iptal edildi.');
  if (!data?.length) return { anilar: [], devamVar: false, toplam: count ?? 0, fotografUyarisi: false };
  const satirlar = data.slice(0, ANI_SAYFA_BOYUTU);
  const yollar = satirlar.map((ani) => ani.memory_images[0]?.storage_path ?? ani.image_url);
  let imzalar: { path: string | null; signedUrl: string | null; error: string | null }[] | null = null;
  let fotografUyarisi = false;
  try {
    const sonuc = await istemci.storage.from(FOTO_BUCKET).createSignedUrls(yollar, 600);
    imzalar = sonuc.data;
    fotografUyarisi = !!sonuc.error;
  } catch { fotografUyarisi = true; }
  const anilar = satirlar.map((ani, i) => {
    // Yanıt sırası farklı olsa bile bir anıya diğerinin fotoğrafı bağlanmaz.
    const imza = imzalar?.find((imza) => imza.path === yollar[i]);
    const fotografUrl = imza && !imza.error ? imza.signedUrl || null : null;
    if (!fotografUrl) fotografUyarisi = true;
    return { id: ani.id, title: ani.title, memory_date: ani.memory_date,
      image_url: yollar[i], fotografUrl };
  });
  return { anilar, devamVar: data.length > ANI_SAYFA_BOYUTU, toplam: count ?? baslangic + data.length, fotografUyarisi };
}
