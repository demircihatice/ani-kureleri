import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { galeriBaglaminiAl } from '../lib/galeriViewerBaglami';
import { galeriyiGetir } from '../services/galleryService';
import { yollariImzala } from '../services/apiMemoryService';
import { useViewerAnisi } from './useViewerAnisi';
import type { GaleriAnisi, GaleriSayfasi } from '../types/galeri';

export function useGaleriViewer(kullaniciId: string, baglamId: string, aniId: string, ilkFoto: number) {
  const anahtar = `${kullaniciId}:${baglamId}`;
  const [durum, ayarla] = useState(() => {
    const baglam = galeriBaglaminiAl(kullaniciId, baglamId);
    const secili = baglam?.sayfa.anilar.findIndex(f => f.id === aniId && f.fotografSirasi === ilkFoto) ?? -1;
    return { anahtar, filtre: baglam?.filtre ?? 'tumu', sayfa: secili >= 0 ? baglam!.sayfa : null as GaleriSayfasi | null, secili: Math.max(0, secili), hata: null as string | null, yukleniyor: false };
  });
  const istek = useRef<AbortController | null>(null);
  const kilit = useRef(false);
  const guncelRef = useRef(durum.sayfa);
  const gecerli = durum.anahtar === anahtar && !!galeriBaglaminiAl(kullaniciId, baglamId);
  const sayfa = gecerli ? durum.sayfa : null;
  const aktif = sayfa?.anilar[durum.secili];
  const detay = useViewerAnisi(kullaniciId, aktif?.id ?? '');
  useEffect(() => { guncelRef.current = sayfa; }, [sayfa]);
  useEffect(() => () => { istek.current?.abort(); kilit.current = false; }, [anahtar]);

  const dahaFazla = useCallback(async () => {
    if (!gecerli || !durum.sayfa?.devamVar || kilit.current) return;
    const kontrol = new AbortController(); istek.current = kontrol; kilit.current = true;
    ayarla(eski => ({ ...eski, yukleniyor: true, hata: null }));
    try {
      const veri = await galeriyiGetir(kullaniciId, durum.filtre, durum.sayfa.sonrakiBaslangic ?? 0, kontrol.signal, false, true);
      const guvenli = veri.anilar.filter(f => f.fotografYolu?.startsWith(`${kullaniciId}/${f.id}/`) && !f.fotografYolu.includes('..') &&
        (durum.filtre === 'tumu' || f.duygu === durum.filtre));
      if (!kontrol.signal.aborted) ayarla(eski => ({ ...eski, yukleniyor: false,
        sayfa: { ...veri, anilar: [...(eski.sayfa?.anilar ?? []), ...guvenli].filter((f, i, tum) => tum.findIndex(d => d.id === f.id && d.fotografYolu === f.fotografYolu) === i) } }));
    } catch {
      if (!kontrol.signal.aborted) ayarla(eski => ({ ...eski, yukleniyor: false, hata: 'Diğer fotoğraflar yüklenemedi. Tekrar dene.' }));
    } finally { if (istek.current === kontrol) kilit.current = false; }
  }, [gecerli, durum.sayfa, durum.filtre, kullaniciId]);
  useEffect(() => {
    if (sayfa?.devamVar && durum.secili >= sayfa.anilar.length - 3 && !durum.hata) void dahaFazla();
  }, [sayfa, durum.secili, durum.hata, dahaFazla]);

  // Yalnız metadata imzalarını yeniler; bütün büyük fotoğrafları indirmez.
  useFocusEffect(useCallback(() => {
    if (!gecerli) return;
    let acik = true, nesil = 0;
    const imzalariYenile = async () => {
      const sira = ++nesil;
      const yollar = guncelRef.current?.anilar.map(f => f.fotografYolu!).filter(Boolean) ?? [];
      const imzalar = await yollariImzala(kullaniciId, yollar);
      if (acik && sira === nesil) ayarla(eski => ({ ...eski, sayfa: eski.sayfa ? { ...eski.sayfa,
        anilar: eski.sayfa.anilar.map(f => ({ ...f, kapak: imzalar.get(f.fotografYolu!) ?? f.kapak })) } : null }));
    };
    let timer = setTimeout(function yenile() { void imzalariYenile(); timer = setTimeout(yenile, 8 * 60 * 1000); }, 8 * 60 * 1000);
    const listener = AppState.addEventListener('change', hal => {
      clearTimeout(timer); nesil++;
      if (hal === 'active') {
        void imzalariYenile();
        timer = setTimeout(function yenile() { void imzalariYenile(); timer = setTimeout(yenile, 8 * 60 * 1000); }, 8 * 60 * 1000);
      }
    });
    return () => { acik = false; nesil++; clearTimeout(timer); listener.remove(); };
  }, [gecerli, kullaniciId]));
  const fotograflar = (sayfa?.anilar ?? []).map((foto: GaleriAnisi) => ({ yol: foto.fotografYolu!,
    url: detay.veri?.ani.fotograflar.find(f => foto.id === detay.veri?.ani.id && f.yol === foto.fotografYolu)?.url ?? foto.kapak,
    aniId: foto.id, fotografSirasi: foto.fotografSirasi ?? 0 }));
  return { fotograflar, secili: durum.secili, sec: (sira: number) => {
    if (sayfa && sira >= 0 && sira < sayfa.anilar.length) ayarla(eski => ({ ...eski, secili: sira }));
  }, bilgi: detay.veri, bilgiHatasi: detay.hata, yenile: detay.yenile, dahaFazla,
  devamVar: sayfa?.devamVar ?? false, yukleniyor: durum.yukleniyor, hata: durum.hata,
  gecerli: !!sayfa };
}
