import { memoryApiEtkin } from '../constants/api';
import { apiGalerisiniGetir } from './apiMemoryService';
import { supabaseIstemcisiniAl } from '../lib/supabase';
import { FOTO_BUCKET } from '../constants/ani';
import { eskiDuyguKodu, type DuyguFiltresi } from '../constants/duyguSunumu';
import type { GaleriSayfasi } from '../types/galeri';
export const GALERI_SAYFA_BOYUTU = 30;
interface Satir { id: string; title: string; memory_date: string; image_url: string;
  spheres: { emotion_type: string } | null; memory_images: { storage_path: string; sort_order: number }[] }
// Canlı eski şemaya uyarlama: ekranlar fiziksel küre modelini bilmez.
export async function galeriyiGetir(kullaniciId: string, filtre: DuyguFiltresi, baslangic: number,
  sinyal: AbortSignal, sadeceOzet = false, tumFotograflar = false): Promise<GaleriSayfasi> {
  if (!kullaniciId || !Number.isInteger(baslangic) || baslangic < 0) throw new Error('Geçerli kullanıcı ve sayfa bilgisi gerekli.');
  const istemci = supabaseIstemcisiniAl();
  const simdi = new Date();
  const ay = `${simdi.getFullYear()}-${String(simdi.getMonth() + 1).padStart(2, '0')}-01`;
  const gelecek = new Date(simdi.getFullYear(), simdi.getMonth() + 1, 1);
  const son = `${gelecek.getFullYear()}-${String(gelecek.getMonth() + 1).padStart(2, '0')}-01`;
  const [tum, buAy] = await Promise.all([
    istemci.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', kullaniciId).abortSignal(sinyal),
    istemci.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', kullaniciId)
      .gte('memory_date', ay).lt('memory_date', son).abortSignal(sinyal),
  ]);
  if (tum.error || buAy.error) throw new Error('Anı bilgileri yüklenemedi. Tekrar dene.');
  const ozet = { toplam: tum.count ?? 0, buAy: buAy.count ?? 0 };
  if (sinyal.aborted) throw new Error('İstek iptal edildi.');
  if (sadeceOzet) return { ...ozet,anilar:[],devamVar:false,fotografUyarisi:false };
  if (memoryApiEtkin()) return { ...ozet,...await apiGalerisiniGetir(kullaniciId,filtre,baslangic,sinyal,tumFotograflar) };
  if ( !['tumu', 'joy', 'sadness'].includes(filtre)) return { ...ozet, anilar: [], devamVar: false, fotografUyarisi: false };
  let sorgu = istemci.from('memories')
    .select(`id, title, memory_date, image_url, spheres${filtre === 'tumu' ? '' : '!inner'}(emotion_type), memory_images(storage_path, sort_order)`)
    .eq('user_id', kullaniciId);
  if (filtre !== 'tumu') sorgu = sorgu.eq('spheres.emotion_type', filtre === 'joy' ? 'mutluluk' : 'huzun');
  let siraliSorgu = sorgu.order('memory_date', { ascending: false }).order('created_at', { ascending: false })
    .order('id', { ascending: false }).order('sort_order', { referencedTable: 'memory_images', ascending: true });
  if (!tumFotograflar) siraliSorgu = siraliSorgu.limit(1, { referencedTable: 'memory_images' });
  const { data, error } = await siraliSorgu.range(baslangic, baslangic + GALERI_SAYFA_BOYUTU)
    .abortSignal(sinyal).returns<Satir[]>();
  if (error) throw new Error('Anıların yüklenemedi. Bağlantını kontrol edip tekrar dene.');
  if (sinyal.aborted) throw new Error('İstek iptal edildi.');
  const satirlar = (data ?? []).slice(0, GALERI_SAYFA_BOYUTU);
  const fotograflar = satirlar.flatMap((ani) => {
    const yollar = ani.memory_images.length ? ani.memory_images.map((f) => f.storage_path) : [ani.image_url];
    return (tumFotograflar ? yollar : yollar.slice(0,1)).map((yol,fotografSirasi) => ({ ani,yol,fotografSirasi }));
  });
  const yollar = fotograflar.map((foto) => foto.yol);
  let imzalar: { path: string | null; signedUrl: string | null; error: string | null }[] | null = null;
  if (yollar.length) {
    try { const sonuc = await istemci.storage.from(FOTO_BUCKET).createSignedUrls(yollar, 600); imzalar = sonuc.data; }
    catch { /* Fotoğraf hatası metinleri gizlemez. */ }
  }
  const anilar = fotograflar.map(({ani,yol,fotografSirasi}) => {
    const imza = imzalar?.find((imza) => imza.path === yol && !imza.error);
    return { id:ani.id,baslik:ani.title,tarih:ani.memory_date,duygu:eskiDuyguKodu(ani.spheres?.emotion_type),
      kapak:imza?.signedUrl ?? null,...(tumFotograflar ? {fotografYolu:yol,fotografSirasi}: {}) };
  });
  return { ...ozet, anilar, sonrakiBaslangic:baslangic+satirlar.length,
    devamVar:(data?.length ?? 0)>GALERI_SAYFA_BOYUTU, fotografUyarisi:anilar.some((ani) => !ani.kapak) };
}
