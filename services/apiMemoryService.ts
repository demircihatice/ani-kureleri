import { apiIstegi, ApiHatasi } from './apiClient';
import { supabaseIstemcisiniAl } from '../lib/supabase';
import { FOTO_BUCKET } from '../constants/ani';
import { eskiDuyguKodu, type DuyguFiltresi } from '../constants/duyguSunumu';
import type { ApiAni } from '../types/analiz';
import type { GaleriAnisi } from '../types/galeri';
import type { AniDuzenleme } from '../types/ani';
import { aniDuzenlemesiniDogrula } from '../lib/aniDogrulama';
export async function yollariImzala(kullaniciId:string,yollar:string[]) {
  const guvenli = yollar.filter((yol) => yol.startsWith(`${kullaniciId}/`) && !yol.includes('..'));
  if (!guvenli.length) return new Map<string,string>();
  try {
    const {data} = await supabaseIstemcisiniAl().storage.from(FOTO_BUCKET).createSignedUrls(guvenli,600);
    return new Map((data ?? []).filter((f) => f.path && f.signedUrl && !f.error).map((f) => [f.path!,f.signedUrl]));
  } catch { return new Map<string,string>(); }
}
export async function apiAniDetayiniGetir(kullaniciId:string,id:string,sinyal?:AbortSignal) {
  const ani = await apiIstegi<ApiAni>(`/v1/memories/${encodeURIComponent(id)}`,{sinyal});
  if (!ani || ani.user_id !== kullaniciId || ani.id !== id || !Array.isArray(ani.photos)) throw new ApiHatasi('Anı yanıtı doğrulanamadı.',null,false);
  const imzalar = await yollariImzala(kullaniciId,ani.photos.map((f) => f.storage_path));
  return { ani, imzalar };
}
export async function apiGalerisiniGetir(kullaniciId:string,filtre:DuyguFiltresi,baslangic:number,sinyal:AbortSignal,tumFotograflar=false) {
  const query = `page=${Math.floor(baslangic/30)+1}&page_size=30${filtre==='tumu' ? '' : `&emotion=${filtre}`}`;
  const sonuc = await apiIstegi<{ items: {id:string;title:string;memory_date:string;cover:ApiAni['cover'];photos?:ApiAni['photos'];final_emotion:ApiAni['final_emotion']}[];has_more:boolean }>(`/v1/memories?${query}`,{sinyal});
  if (!Array.isArray(sonuc.items) || typeof sonuc.has_more !== 'boolean') throw new ApiHatasi('Galeri yanıtı doğrulanamadı.',null,false);
  const fotograflar = sonuc.items.flatMap((ani) => {
    const resimler = tumFotograflar && ani.photos?.length ? ani.photos : [ani.cover];
    return resimler.map((foto,fotografSirasi) => ({ani,foto,fotografSirasi}));
  });
  const imzalar = await yollariImzala(kullaniciId,fotograflar.flatMap(({foto}) => foto ? [foto.storage_path]:[]));
  const anilar:GaleriAnisi[] = fotograflar.map(({ani,foto,fotografSirasi}) => ({id:ani.id,baslik:ani.title,tarih:ani.memory_date,
    kapak:foto ? imzalar.get(foto.storage_path) ?? null:null,duygu:eskiDuyguKodu(ani.final_emotion?.code),
    ...(tumFotograflar ? {fotografYolu:foto?.storage_path,fotografSirasi}: {}) }));
  return { anilar,sonrakiBaslangic:baslangic+sonuc.items.length,
    devamVar:sonuc.has_more,fotografUyarisi:anilar.some((ani) => !ani.kapak) };
}

export async function apiAniBilgileriniGuncelle(id:string,form:Omit<AniDuzenleme,'kureId'>,version:number) {
  const hata = aniDuzenlemesiniDogrula({ ...form, kureId: 'koru' }, ['koru']);
  if (hata) throw new Error(hata);
  return apiIstegi<ApiAni>(`/v1/memories/${encodeURIComponent(id)}`,{yontem:'PATCH',govde:{
    title:form.baslik.trim(),description:form.aciklama.trim() || null,memory_date:form.tarih,version,
  }});
}
