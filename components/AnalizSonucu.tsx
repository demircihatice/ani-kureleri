import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { DuyguKodu } from '../constants/duyguSunumu';
import { duyguSunumu } from '../constants/duyguSunumu';
import { ORTAK } from '../constants/tema';
import { AnaKure } from './ui/AnaKure';
import { DuyguDuzenleyici } from './ui/DuyguSecimi';
import { Dugme } from './Dugme';
// Yalnızca doğrulanmış gerçek sonuç sağlandığında gösterilecek; üretim rotasına bağlı değil.
export function AnalizSonucu({ sonuc, duyguDegistir, galeriyeDon }:
  { sonuc: { duygu: DuyguKodu; baslik: string; tarih: string; kapak: string | null } | null;
    duyguDegistir?: () => void; galeriyeDon?: () => void }) {
  const [duzenliyor, ayarla] = useState(false);
  const [secili, sec] = useState<DuyguKodu | null>(null);
  if (!sonuc) return <Text style={ORTAK.metin}>Henüz analiz sonucu yok.</Text>;
  const sunum = duyguSunumu(sonuc.duygu);
  return <View style={{ gap: 18 }}>
    <Text style={ORTAK.baslik}>{sonuc.duygu === 'alexithymia' ? 'Duygu netleşmedi' : 'Duygu Belirlendi'}</Text><AnaKure buyuk renk={sunum?.zemin} />
    <Text style={ORTAK.baslik}>{sunum?.ikon} {sunum?.ad}</Text>
    {sonuc.kapak && <Image source={{ uri: sonuc.kapak }} accessibilityLabel={sonuc.baslik} style={{ width: '100%', aspectRatio: 1, borderRadius: 24 }} />}
    <Text style={ORTAK.etiket}>{sonuc.baslik}</Text><Text style={ORTAK.metin}>{sonuc.tarih}</Text>
    {galeriyeDon ? <Dugme baslik="Galeriye Dön" tiklaninca={galeriyeDon} />
      : <Text style={ORTAK.metin}>Sonucu kaydetme yakında kullanılabilecek.</Text>}
    <Dugme baslik="Duyguyu Değiştir" ikincil tiklaninca={() => {
      if (duyguDegistir) duyguDegistir(); else { sec(sonuc.duygu); ayarla(true); }
    }} />
    {duzenliyor && <DuyguDuzenleyici secili={secili} sec={sec} />}
  </View>;
}
