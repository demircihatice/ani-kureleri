import { useEffect, useRef, useState } from 'react';
import { Alert, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Sayfa } from '../../components/Sayfa';
import { Dugme } from '../../components/Dugme';
import { DuyguDuzenleyici } from '../../components/ui/DuyguSecimi';
import { useOturum } from '../../hooks/useOturum';
import { useAnaliz } from '../../hooks/useAnaliz';
import { duyguGeriBildirimi } from '../../services/feedbackService';
import { ApiHatasi } from '../../services/apiClient';
import { ORTAK } from '../../constants/tema';
import { duyguSunumu, type DuyguKodu } from '../../constants/duyguSunumu';
export default function DuyguDuzenlemeEkrani() {
  const {memoryId} = useLocalSearchParams<{memoryId:string}>();
  const id = typeof memoryId==='string' ? memoryId:'';
  const {oturum} = useOturum();
  const {veri,hata,yenile} = useAnaliz(oturum?.user.id ?? '',id);
  const duygu = duyguSunumu(veri?.final_emotion?.code);
  return <Sayfa>
    {veri?.status==='completed' && duygu ? <DuzeltmeFormu key={`${oturum?.user.id}:${id}:${veri.version}`}
      id={id} version={veri.version} duygu={duygu.kod} yenile={yenile} />
      : <Text style={ORTAK.metin}>{hata ?? 'Duygu düzeltmek için tamamlanmış bir analiz gerekiyor.'}</Text>}
    <Dugme baslik="Güncel durumu al" ikincil tiklaninca={yenile} />
  </Sayfa>;
}
export function DuzeltmeFormu({id,version,duygu,yenile}:{id:string;version:number;duygu:DuyguKodu;yenile:()=>void}) {
  const [secili,sec] = useState<DuyguKodu>(duygu);
  const [bekliyor,ayarla] = useState(false);
  const [hata,hatayiAyarla] = useState<string|null>(null);
  const [kaydedildi,kaydiAyarla] = useState(false);
  const istek = useRef(false);
  usePreventRemove(bekliyor,() => Alert.alert('Geri bildirim kaydediliyor','İşlem tamamlanana kadar bekle.'));
  useEffect(() => {
    if (kaydedildi && !bekliyor) router.replace({pathname:'/analiz-sonucu',params:{memoryId:id}});
  },[kaydedildi,bekliyor,id]);
  async function kaydet() {
    if (istek.current) return;
    istek.current=true; ayarla(true); hatayiAyarla(null);
    try {
      await duyguGeriBildirimi(id,secili,version);
      kaydiAyarla(true);
    } catch (sorun) {
      hatayiAyarla(sorun instanceof ApiHatasi && sorun.durum===409 ? 'Anı değişmiş. Güncel durumu alıp tekrar seç.' :
        'Düzeltme sonucu doğrulanamadı. Güncel durumu kontrol edip tekrar dene.');
    } finally { istek.current=false; ayarla(false); }
  }
  return <>
    <DuyguDuzenleyici secili={secili} sec={sec} bekliyor={bekliyor} kaydet={() => void kaydet()} />
    <Text style={ORTAK.metin}>Seçimin son duyguyu günceller. İlk model tahmini korunur; model bu işlemle eğitilmez.</Text>
    {hata && <><Text accessibilityRole="alert" style={ORTAK.hata}>{hata}</Text><Dugme baslik="Yenile" ikincil tiklaninca={yenile} /></>}
  </>;
}
