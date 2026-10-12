import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { kureSetiniGetir } from '../services/sphereService';
import { kureAnilariniGetir } from '../services/memoryService';
import { ANI_SAYFA_BOYUTU } from '../constants/ani';
import type { KureOzeti } from '../types/kure';
import type { AniSayfasi } from '../types/ani';

interface Bilgi extends AniSayfasi { kure: KureOzeti; sonrakiBaslangic: number }
interface Durum {
  kullaniciId: string; kureId: string; bilgi: Bilgi | null;
  yukleniyor: boolean; dahaYukleniyor: boolean; hata: string | null;
}

export function useKureAnilari(kullaniciId: string, kureId: string) {
  const [durum, ayarla] = useState<Durum>({ kullaniciId: '', kureId: '', bilgi: null, yukleniyor: true, dahaYukleniyor: false, hata: null });
  const eylemler = useRef<{ yenile: () => void; dahaFazla: () => void } | null>(null);
  useFocusEffect(useCallback(() => {
    let etkin = true;
    let istek: AbortController | null = null;
    let bilgi: Bilgi | null = null;
    let dahaSuruyor = false;
    const guncelle = (yukleniyor: boolean, dahaYukleniyor: boolean, hata: string | null = null) => {
      if (etkin) ayarla({ kullaniciId, kureId, bilgi, yukleniyor, dahaYukleniyor, hata });
    };
    async function ilkSayfa() {
      istek?.abort();
      const kontrol = new AbortController();
      istek = kontrol; bilgi = null; dahaSuruyor = false;
      guncelle(true, false);
      try {
        const set = await kureSetiniGetir(kullaniciId, kontrol.signal);
        const kure = set?.kureler.find((kure) => kure.id === kureId);
        if (!kure) {
          if (etkin && !kontrol.signal.aborted) guncelle(false, false, 'Bu küre bulunamadı veya hesabına ait değil.');
          return;
        }
        const sayfa = await kureAnilariniGetir(kullaniciId, kureId, kontrol.signal);
        if (etkin && !kontrol.signal.aborted) {
          bilgi = { ...sayfa, kure, sonrakiBaslangic: ANI_SAYFA_BOYUTU };
          guncelle(false, false);
        }
      } catch {
        if (etkin && !kontrol.signal.aborted) guncelle(false, false, 'Anılar yüklenemedi. Bağlantını kontrol edip tekrar dene.');
      }
    }
    async function sonrakiSayfa() {
      if (!bilgi?.devamVar || dahaSuruyor) return;
      dahaSuruyor = true;
      const kontrol = new AbortController();
      istek = kontrol;
      const onceki = bilgi;
      guncelle(false, true);
      try {
        const sayfa = await kureAnilariniGetir(kullaniciId, kureId, kontrol.signal, onceki.sonrakiBaslangic);
        if (etkin && !kontrol.signal.aborted) {
          const kimlikler = new Set(onceki.anilar.map((ani) => ani.id));
          bilgi = { ...onceki, ...sayfa,
            anilar: [...onceki.anilar, ...sayfa.anilar.filter((ani) => !kimlikler.has(ani.id))],
            fotografUyarisi: onceki.fotografUyarisi || sayfa.fotografUyarisi,
            sonrakiBaslangic: onceki.sonrakiBaslangic + ANI_SAYFA_BOYUTU };
          guncelle(false, false);
        }
      } catch {
        if (etkin && !kontrol.signal.aborted) guncelle(false, false, 'Diğer anılar yüklenemedi. Daha fazla anı düğmesiyle tekrar dene.');
      } finally { if (!kontrol.signal.aborted) dahaSuruyor = false; }
    }
    eylemler.current = { yenile: () => void ilkSayfa(), dahaFazla: () => void sonrakiSayfa() };
    void ilkSayfa();
    const dinleyici = AppState.addEventListener('change', (hal) => { if (hal === 'active') void ilkSayfa(); });
    return () => { etkin = false; istek?.abort(); dinleyici.remove(); eylemler.current = null; };
  }, [kullaniciId, kureId]));
  const ayniHesapVeKure = durum.kullaniciId === kullaniciId && durum.kureId === kureId;
  return {
    bilgi: ayniHesapVeKure ? durum.bilgi : null,
    yukleniyor: !ayniHesapVeKure || durum.yukleniyor,
    dahaYukleniyor: ayniHesapVeKure && durum.dahaYukleniyor,
    hata: ayniHesapVeKure ? durum.hata : null,
    yenile: () => eylemler.current?.yenile(),
    dahaFazla: () => eylemler.current?.dahaFazla(),
  };
}
