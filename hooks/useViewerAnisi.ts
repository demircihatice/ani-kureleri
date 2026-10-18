import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { galeriDetayiniGetir } from '../services/galleryDetailService';

export type ViewerAnisi = Awaited<ReturnType<typeof galeriDetayiniGetir>>;
export function useViewerAnisi(kullaniciId: string, id: string) {
  const anahtar = `${kullaniciId}:${id}`;
  const yenileRef = useRef<() => void>(() => {});
  const [durum, ayarla] = useState<{ anahtar: string; veri: ViewerAnisi | null; hata: string | null }>({ anahtar: '', veri: null, hata: null });
  useFocusEffect(useCallback(() => {
    let aktif = true;
    let kontrol: AbortController | null = null;
    let zamanlayici: ReturnType<typeof setTimeout> | undefined;
    async function yukle() {
      clearTimeout(zamanlayici); kontrol?.abort();
      const yeni = new AbortController(); kontrol = yeni;
      ayarla(eski => eski.anahtar === anahtar ? { ...eski, hata: null } : eski);
      try {
        if (!kullaniciId || !id) throw new Error();
        const veri = await galeriDetayiniGetir(kullaniciId, id, yeni.signal);
        if (veri.ani.id !== id || veri.ani.fotograflar.length > 5 ||
          veri.ani.fotograflar.some(f => !f.yol.startsWith(`${kullaniciId}/${id}/`) || f.yol.includes('..'))) throw new Error();
        if (aktif && !yeni.signal.aborted) ayarla({ anahtar, veri, hata: null });
      } catch {
        if (aktif && !yeni.signal.aborted) ayarla({ anahtar, veri: null, hata: 'Fotoğraflar açılamadı. Anı bulunamadı veya bağlantı kurulamadı.' });
      } finally {
        // Servislerin 600 saniyelik imzalarını süresi dolmadan yeniler; arka planda durur.
        if (aktif && !yeni.signal.aborted) zamanlayici = setTimeout(() => void yukle(), 8 * 60 * 1000);
      }
    }
    // Aynı anının yenilenmesi viewer'ı sökmez; seçili fotoğraf korunur.
    yenileRef.current = () => void yukle();
    void yukle();
    const dinleyici = AppState.addEventListener('change', hal => {
      if (hal === 'active') void yukle();
      else { clearTimeout(zamanlayici); kontrol?.abort(); }
    });
    return () => { aktif = false; yenileRef.current = () => {}; kontrol?.abort(); clearTimeout(zamanlayici); dinleyici.remove(); };
  }, [anahtar, kullaniciId, id]));
  return { veri: durum.anahtar === anahtar ? durum.veri : null, hata: durum.anahtar === anahtar ? durum.hata : null,
    yenile: () => yenileRef.current() };
}
