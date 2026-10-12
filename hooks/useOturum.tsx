import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { oturumuAl } from '../services/authService';
import { authHataMesaji } from '../lib/authDogrulama';

interface OturumDurumu {
  oturum: Session | null;
  yukleniyor: boolean;
  hata: string | null;
  tekrarDene: () => void;
}

const OturumBaglami = createContext<OturumDurumu | null>(null);

export function OturumSaglayici({ children }: PropsWithChildren) {
  const [oturum, oturumAyarla] = useState<Session | null>(null);
  const [yukleniyor, yukleniyorAyarla] = useState(true);
  const [hata, hataAyarla] = useState<string | null>(null);
  const [deneme, denemeAyarla] = useState(0);

  useEffect(() => {
    const istemci = supabase;
    if (!istemci) {
      hataAyarla('Supabase ayarları eksik veya geçersiz. .env dosyasını kontrol edip uygulamayı yeniden başlatın.');
      yukleniyorAyarla(false);
      return;
    }

    let etkin = true;
    let olayGeldi = false;
    yukleniyorAyarla(true);
    hataAyarla(null);

    // Callback içinde başka Auth çağrısı yapılmaz: SDK kilitlenmesi önlenir.
    const { data: { subscription } } = istemci.auth.onAuthStateChange((_olay, yeniOturum) => {
      if (!etkin) return;
      olayGeldi = true;
      oturumAyarla(yeniOturum);
      hataAyarla(null);
      yukleniyorAyarla(false);
    });

    void oturumuAl().then((kayitliOturum) => {
      // Giriş/çıkış olayı eski getSession yanıtıyla ezilmez.
      if (etkin && !olayGeldi) oturumAyarla(kayitliOturum);
    }).catch((sorun: unknown) => {
      if (etkin && !olayGeldi) hataAyarla(authHataMesaji(sorun));
    }).finally(() => {
      if (etkin) yukleniyorAyarla(false);
    });

    const yenilemeyiAyarla = (durum: string) => {
      // Web'de SDK tarayıcı görünürlüğünü kendisi takip eder.
      if (durum === 'active') istemci.auth.startAutoRefresh();
      else istemci.auth.stopAutoRefresh();
    };
    const dinleyici = Platform.OS !== 'web'
      ? AppState.addEventListener('change', yenilemeyiAyarla)
      : null;
    if (Platform.OS !== 'web') yenilemeyiAyarla(AppState.currentState);

    return () => {
      etkin = false;
      subscription.unsubscribe();
      dinleyici?.remove();
      if (Platform.OS !== 'web') istemci.auth.stopAutoRefresh();
    };
  }, [deneme]);

  return (
    <OturumBaglami.Provider value={{ oturum, yukleniyor, hata, tekrarDene: () => denemeAyarla((sayi) => sayi + 1) }}>
      {children}
    </OturumBaglami.Provider>
  );
}

export function useOturum() {
  const deger = useContext(OturumBaglami);
  if (!deger) throw new Error('useOturum, OturumSaglayici içinde kullanılmalı.');
  return deger;
}
