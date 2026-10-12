import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { kureSetiniGetir } from '../services/sphereService';
import type { KureSetiOzeti } from '../types/kure';

interface Durum {
  kullaniciId: string;
  set: KureSetiOzeti | null;
  yukleniyor: boolean;
  hata: string | null;
}

export function useKureler(kullaniciId: string) {
  const [durum, ayarla] = useState<Durum>({ kullaniciId: '', set: null, yukleniyor: true, hata: null });
  const [deneme, denemeyiAyarla] = useState(0);
  useFocusEffect(useCallback(() => {
    let etkin = true;
    let istek: AbortController | null = null;
    async function yukle() {
      istek?.abort();
      const kontrol = new AbortController();
      istek = kontrol;
      // Yenilemede eski sayılar gösterilmez; başarısız istek 0 Anı gibi görünmez.
      ayarla({ kullaniciId, set: null, yukleniyor: true, hata: null });
      try {
        const set = await kureSetiniGetir(kullaniciId, kontrol.signal);
        if (etkin && !kontrol.signal.aborted) ayarla({ kullaniciId, set, yukleniyor: false, hata: null });
      } catch {
        if (etkin && !kontrol.signal.aborted) ayarla({ kullaniciId, set: null, yukleniyor: false,
          hata: 'Kürelerin yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.' });
      }
    }
    void yukle();
    const dinleyici = AppState.addEventListener('change', (hal) => {
      if (hal === 'active') void yukle();
    });
    return () => { etkin = false; istek?.abort(); dinleyici.remove(); };
  }, [kullaniciId, deneme]));
  // Hesap değişiminde önceki hesabın sonuçları tek kare için dahi gösterilmez.
  return {
    set: durum.kullaniciId === kullaniciId ? durum.set : null,
    yukleniyor: durum.kullaniciId !== kullaniciId || durum.yukleniyor,
    hata: durum.kullaniciId === kullaniciId ? durum.hata : null,
    yenile: () => denemeyiAyarla((n) => n + 1),
  };
}
