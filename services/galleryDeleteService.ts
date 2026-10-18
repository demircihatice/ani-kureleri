import { supabaseIstemcisiniAl } from '../lib/supabase';
import { FOTO_BUCKET } from '../constants/ani';
import type { GaleriAnisi } from '../types/galeri';

export async function galeriFotograflariniSil(kullaniciId: string, fotograflar: GaleriAnisi[]) {
  if (!kullaniciId || !fotograflar.length || fotograflar.length > 1000) throw new Error('Silmek için 1–1000 fotoğraf seç.');
  const secim = fotograflar.map(f => {
    const parcalar = f.fotografYolu?.split('/');
    if (!parcalar || parcalar.length !== 3 || parcalar[0] !== kullaniciId || parcalar[1] !== f.id || !/^[0-4]\.jpg$/.test(parcalar[2])) {
      throw new Error('Fotoğraf yolu hesabınla eşleşmiyor. Galeriyi yenile.');
    }
    return { memory_id: f.id, storage_path: f.fotografYolu! };
  }).filter((f,i,tum) => tum.findIndex(d => d.storage_path === f.storage_path) === i);
  const istemci = supabaseIstemcisiniAl();
  async function oturumuDogrula() {
    const { data, error } = await istemci.auth.getSession();
    if (error || data.session?.user.id !== kullaniciId) throw new Error('Oturum değişti. Kendi hesabınla tekrar giriş yap.');
  }
  await oturumuDogrula();
  // Ağ hatasında Storage'a dokunulmaz; aynı seçimle RPC güvenle yinelenebilir.
  let sonuc;
  try { sonuc = await istemci.rpc('galeri_fotograflarini_sil', { p_fotograflar: secim }); }
  catch { throw new Error('Silme sonucu doğrulanamadı. Aynı seçimle tekrar dene.'); }
  if (sonuc.error) {
    if (sonuc.error.code === 'PGRST202' || sonuc.error.code === '42883') throw new Error('Fotoğraf silme SQL kurulumu henüz yapılmamış.');
    if (sonuc.error.code === '55000') throw new Error('Analiz sürerken fotoğraf silinemez. Analiz tamamlanınca tekrar dene.');
    throw new Error('Fotoğraflar silinemedi. Aynı seçimle tekrar dene.');
  }
  const beklenen = new Set(secim.map(f => f.storage_path));
  if (!Array.isArray(sonuc.data) || sonuc.data.length !== beklenen.size || sonuc.data.some(yol => typeof yol !== 'string' || !beklenen.has(yol)) || new Set(sonuc.data).size !== beklenen.size) {
    throw new Error('Silme sonucu doğrulanamadı. Aynı seçimle tekrar dene.');
  }
  await oturumuDogrula();
  try {
    const { data, error } = await istemci.storage.from(FOTO_BUCKET).remove(sonuc.data);
    if (error || !data || secim.some(f => !data.some(d => d.name === f.storage_path))) {
      // Storage zaten olmayan bir dosyayı döndürmeyebilir; kalanları listeyle doğrula.
      for (const f of secim) {
        await oturumuDogrula();
        const [uid, aniId, ad] = f.storage_path.split('/');
        const kontrol = await istemci.storage.from(FOTO_BUCKET).list(`${uid}/${aniId}`, { search: ad, limit: 100 });
        if (kontrol.error || kontrol.data?.some(d => d.name === ad) || !kontrol.data) throw new Error();
      }
    }
  } catch { throw new Error('Anı kayıtları kaldırıldı ancak dosya temizliği doğrulanamadı. Sil düğmesine tekrar bas.'); }
}
