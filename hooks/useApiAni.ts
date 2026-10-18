import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { apiAniDetayiniGetir } from '../services/apiMemoryService';
import { memoryApiEtkin } from '../constants/api';
export function useApiAni(kullaniciId:string,id:string) {
  const anahtar = `${kullaniciId}:${id}`;
  const [durum,ayarla] = useState<{anahtar:string;veri:Awaited<ReturnType<typeof apiAniDetayiniGetir>>|null;hata:string|null}>({anahtar:'',veri:null,hata:null});
  useFocusEffect(useCallback(() => {
    const kontrol = new AbortController();
    if (!memoryApiEtkin() || !id) {
      ayarla({anahtar,veri:null,hata:'Analiz API bağlantısı veya anı bilgisi hazır değil.'}); return;
    }
    ayarla({anahtar,veri:null,hata:null});
    void apiAniDetayiniGetir(kullaniciId,id,kontrol.signal).then((veri) => {
      if (!kontrol.signal.aborted) ayarla({anahtar,veri,hata:null});
    }).catch(() => { if (!kontrol.signal.aborted) ayarla({anahtar,veri:null,hata:'Anı sonucu yüklenemedi. Galeriden tekrar deneyebilirsin.'}); });
    return () => kontrol.abort();
  },[anahtar,kullaniciId,id]));
  return {veri:durum.anahtar===anahtar ? durum.veri:null,hata:durum.anahtar===anahtar ? durum.hata:null};
}
