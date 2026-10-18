import { supabaseIstemcisiniAl } from '../lib/supabase';
import { FOTO_BUCKET } from '../constants/ani';
import { memoryApiEtkin } from '../constants/api';
import { apiBaglantisiniDogrula, apiIstegi, ApiHatasi } from './apiClient';
import { fotografiHazirla } from './photoService';
import type { AniFormu } from '../types/ani';
import type { ApiAni } from '../types/analiz';
import { yeniAniTarihiniDogrula } from '../lib/aniDogrulama';
export interface YeniAniDenemesi { id:string; kullaniciId:string; form:Omit<AniFormu,'kureId'>;
  yollar:string[]; yuklendi:boolean; temizlikGerekli?:boolean }
export class YeniAniHatasi extends Error { constructor(mesaj:string,public belirsiz:boolean) { super(mesaj); } }
export async function analizIcinAniOlustur(deneme:YeniAniDenemesi,ilerleme:(mesaj:string)=>void): Promise<ApiAni> {
  if (!memoryApiEtkin()) throw new YeniAniHatasi('Yeni analiz akışı için backend bağlantısı henüz etkinleştirilmedi.',false);
  const tarihHatasi = yeniAniTarihiniDogrula(deneme.form.tarih);
  if (tarihHatasi) throw new YeniAniHatasi(tarihHatasi,false);
  apiBaglantisiniDogrula();
  const istemci = supabaseIstemcisiniAl();
  const session = await istemci.auth.getSession();
  if (session.error || session.data.session?.user.id !== deneme.kullaniciId) throw new YeniAniHatasi('Oturum değişti. Kendi hesabınla yeniden giriş yap.',true);
  const bucket = istemci.storage.from(FOTO_BUCKET);
  async function temizle() { try { return !(await bucket.remove(deneme.yollar)).error; } catch { return false; } }
  if (deneme.temizlikGerekli) {
    if (!await temizle()) throw new YeniAniHatasi('Yarım yükleme temizlenemedi. Bağlantını açıp aynı işlemi tekrar dene.',true);
    deneme.temizlikGerekli = false;
  }
  if (!deneme.yuklendi) {
    try {
      for (let i=0;i<deneme.form.fotograflar.length;i++) {
        ilerleme(`Fotoğraf ${i+1}/${deneme.form.fotograflar.length} yükleniyor…`);
        const veri = await fotografiHazirla(deneme.form.fotograflar[i]);
        const sonuc = await bucket.upload(deneme.yollar[i],veri,{contentType:'image/jpeg',upsert:false});
        if (sonuc.error) throw new Error('Yükleme başarısız.');
      }
      deneme.yuklendi = true;
    } catch {
      deneme.temizlikGerekli = !await temizle();
      throw new YeniAniHatasi('Fotoğraflar yüklenemedi. Bağlantını kontrol edip tekrar dene.',!!deneme.temizlikGerekli);
    }
  }
  ilerleme('Anı analiz için hazırlanıyor…');
  try {
    const sonuc = await apiIstegi<ApiAni>('/v1/memories',{yontem:'POST',govde:{id:deneme.id,title:deneme.form.baslik,
      description:deneme.form.aciklama,memory_date:deneme.form.tarih,storage_paths:deneme.yollar}});
    if (sonuc.id !== deneme.id || sonuc.user_id !== deneme.kullaniciId) throw new YeniAniHatasi('Kayıt yanıtı doğrulanamadı. Aynı işlemi tekrar dene.',true);
    return sonuc;
  } catch (hata) {
    // Kaybolan POST yanıtında dosyalar korunur; retry aynı UUID ve aynı içerikle yapılır.
    if (hata instanceof YeniAniHatasi) throw hata;
    if (hata instanceof ApiHatasi && !hata.belirsiz && hata.durum !== 409) {
      deneme.temizlikGerekli = !await temizle(); deneme.yuklendi = false;
      throw new YeniAniHatasi(hata.message,!!deneme.temizlikGerekli);
    }
    throw new YeniAniHatasi('Kayıt sonucu doğrulanamadı. Alanları değiştirmeden aynı kaydı tekrar dene.',true);
  }
}
