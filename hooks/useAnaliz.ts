import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { analizDurumunuGetir } from '../services/analysisService';
import { analiziIzle } from '../lib/analizIzleyici';
import { memoryApiEtkin } from '../constants/api';
import type { AnalizBilgisi } from '../types/analiz';
export function useAnaliz(kullaniciId: string,id: string) {
  const anahtar = `${kullaniciId}:${id}`;
  const [durum,ayarla] = useState<{ anahtar:string; veri:AnalizBilgisi|null; hata:string|null; zamanDoldu:boolean; yukleniyor:boolean }>({ anahtar:'',veri:null,hata:null,zamanDoldu:false,yukleniyor:false });
  const durdur = useRef<(() => void) | null>(null);
  const baslat = useCallback(() => {
    durdur.current?.();
    if (AppState.currentState && AppState.currentState !== 'active') return;
    if (!memoryApiEtkin() || !id || !kullaniciId) {
      ayarla({anahtar,veri:null,hata:'Analiz API bağlantısı henüz yapılandırılmadı.',zamanDoldu:false,yukleniyor:false}); return;
    }
    ayarla({anahtar,veri:null,hata:null,zamanDoldu:false,yukleniyor:true});
    durdur.current = analiziIzle({ getir:(sinyal) => analizDurumunuGetir(id,sinyal),
      degisti:(veri) => ayarla({anahtar,veri,hata:null,zamanDoldu:false,yukleniyor:false}),
      hata:() => ayarla((eski) => ({...eski,anahtar,hata:'Analiz durumu alınamadı. Bağlantını kontrol edip yenile.',yukleniyor:false})),
      zamanDoldu:() => ayarla((eski) => ({...eski,zamanDoldu:true,yukleniyor:false})),
    });
  },[anahtar,id,kullaniciId]);
  useFocusEffect(useCallback(() => {
    if (AppState.currentState === 'active' || AppState.currentState == null) baslat();
    const dinleyici = AppState.addEventListener('change',(hal) => { if (hal==='active') baslat(); else durdur.current?.(); });
    return () => { durdur.current?.(); dinleyici.remove(); };
  },[baslat]));
  return { veri:durum.anahtar===anahtar ? durum.veri:null, hata:durum.anahtar===anahtar ? durum.hata:null,
    zamanDoldu:durum.anahtar===anahtar && durum.zamanDoldu, yukleniyor:durum.anahtar!==anahtar || durum.yukleniyor,
    yenile:baslat };
}
