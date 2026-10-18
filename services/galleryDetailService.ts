import { memoryApiEtkin } from '../constants/api';
import { apiAniDetayiniGetir, apiAniBilgileriniGuncelle } from './apiMemoryService';
import { aniBilgileriniGuncelle, aniDetayiniGetir } from './memoryService';
import { eskiDuyguKodu } from '../constants/duyguSunumu';
import type { AniDuzenleme } from '../types/ani';
import { kureSetiniGetir } from './sphereService';
export async function galeriDetayiniGetir(kullaniciId: string, id: string, sinyal: AbortSignal) {
  if (memoryApiEtkin()) {
    const {ani,imzalar} = await apiAniDetayiniGetir(kullaniciId,id,sinyal);
    return { ani:{id:ani.id,title:ani.title,description:ani.description,memory_date:ani.memory_date,sphere_id:ani.sphere_id,
      version:ani.version,analizDurumu:ani.analysis_status,
      fotograflar:ani.photos.map((f) => ({yol:f.storage_path,url:imzalar.get(f.storage_path) ?? null}))},
      duygu:eskiDuyguKodu(ani.final_emotion?.code) };
  }
  const [ani, set] = await Promise.all([aniDetayiniGetir(kullaniciId, id, sinyal), kureSetiniGetir(kullaniciId, sinyal)]);
  const kure = set?.kureler.find((kayit) => kayit.id === ani.sphere_id);
  if (!kure) throw new Error('Anı bulunamadı veya hesabına ait değil.');
  return { ani, duygu: eskiDuyguKodu(kure.emotion_type) };
}

export async function galeriBilgileriniGuncelle(kullaniciId:string,id:string,form:Omit<AniDuzenleme,'kureId'>,version?:number) {
  if (!memoryApiEtkin()) return aniBilgileriniGuncelle(kullaniciId,id,form);
  if (!version) throw new Error('Anıyı yenileyip tekrar dene.');
  const sonuc = await apiAniBilgileriniGuncelle(id,form,version);
  if (sonuc.id !== id || sonuc.user_id !== kullaniciId) throw new Error('Güncelleme yanıtı doğrulanamadı. Anıyı yenile.');
  return sonuc;
}
