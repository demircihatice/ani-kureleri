import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { guncelProfilFotografi } from '../services/profilePhotoService';

export function useProfilFotografi(kullaniciId: string, yol: unknown) {
  const anahtar = `${kullaniciId}:${typeof yol === 'string' ? yol : ''}`;
  const [durum, ayarla] = useState<{anahtar: string; url: string | null; hata: string | null}>({anahtar: '', url: null, hata: null});
  const nesil = useRef(0);
  const yukle = useCallback(() => {
    const mevcut = ++nesil.current;
    ayarla({anahtar, url: null, hata: null});
    void guncelProfilFotografi(kullaniciId).then((url) => {
      if (nesil.current === mevcut) ayarla({anahtar, url, hata: null});
    }).catch(() => {
      if (nesil.current === mevcut) ayarla({anahtar, url: null, hata: 'Profil fotoğrafı açılamadı.'});
    });
  }, [anahtar, kullaniciId]);
  useFocusEffect(useCallback(() => {
    yukle();
    const dinleyici = AppState.addEventListener('change', (hal) => { if (hal === 'active') yukle(); });
    return () => { nesil.current++; dinleyici.remove(); };
  }, [yukle]));
  return {url: durum.anahtar === anahtar ? durum.url : null, hata: durum.anahtar === anahtar ? durum.hata : null, yenile: yukle};
}
