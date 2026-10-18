import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { galeriyiGetir } from '../services/galleryService';
import type { DuyguFiltresi } from '../constants/duyguSunumu';
import type { GaleriSayfasi } from '../types/galeri';
export function useGaleri(kullaniciId: string, filtre: DuyguFiltresi = 'tumu', sadeceOzet = false, tumFotograflar = false) {
  const anahtar = `${kullaniciId}:${filtre}:${sadeceOzet}:${tumFotograflar}`;
  const [durum, ayarla] = useState<{ anahtar: string; veri: GaleriSayfasi | null; hata: string | null; yukleniyor: boolean }>({ anahtar: '', veri: null, hata: null, yukleniyor: true });
  const istek = useRef<AbortController | null>(null);
  const kilit = useRef(false);
  const yukle = useCallback(() => {
      istek.current?.abort(); const kontrol = new AbortController(); istek.current = kontrol; kilit.current = false;
      ayarla({ anahtar, veri: null, hata: null, yukleniyor: true });
      void galeriyiGetir(kullaniciId, filtre, 0, kontrol.signal, sadeceOzet, tumFotograflar).then((veri) => {
        if (!kontrol.signal.aborted) ayarla({ anahtar, veri, hata: null, yukleniyor: false });
      }).catch(() => {
        if (!kontrol.signal.aborted) ayarla({ anahtar, veri: null, hata: 'Anıların yüklenemedi. Tekrar dene.', yukleniyor: false });
      });
  }, [anahtar, kullaniciId, filtre, sadeceOzet, tumFotograflar]);
  useFocusEffect(useCallback(() => {
    yukle(); const dinleyici = AppState.addEventListener('change', (hal) => { if (hal === 'active') yukle(); });
    return () => { istek.current?.abort(); dinleyici.remove(); };
  }, [yukle]));
  async function dahaFazla() {
    if (kilit.current || durum.anahtar !== anahtar || !durum.veri?.devamVar || durum.yukleniyor) return;
    const kontrol = istek.current;
    if (!kontrol || kontrol.signal.aborted) return;
    kilit.current = true; ayarla((eski) => ({ ...eski, yukleniyor: true, hata: null }));
    try {
      const veri = await galeriyiGetir(kullaniciId, filtre, durum.veri.sonrakiBaslangic ?? durum.veri.anilar.length, kontrol.signal, sadeceOzet, tumFotograflar);
      if (!kontrol.signal.aborted) ayarla((eski) => ({ anahtar, hata: null, yukleniyor: false,
        veri: { ...veri, anilar: [...(eski.veri?.anilar ?? []), ...veri.anilar].filter((ani, sira, tum) => tum.findIndex((diger) => diger.id === ani.id && diger.fotografYolu === ani.fotografYolu) === sira) } }));
    } catch {
      if (!kontrol.signal.aborted) ayarla((eski) => ({ ...eski, yukleniyor: false, hata: 'Diğer anılar yüklenemedi. Tekrar dene.' }));
    } finally { if (!kontrol.signal.aborted) kilit.current = false; }
  }
  return { veri: durum.anahtar === anahtar ? durum.veri : null, hata: durum.anahtar === anahtar ? durum.hata : null,
    yukleniyor: durum.anahtar !== anahtar || durum.yukleniyor, yenile: yukle, dahaFazla };
}
