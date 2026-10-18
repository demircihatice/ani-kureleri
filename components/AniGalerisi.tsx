import { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AniDetayi } from '../types/ani';
import { RENKLER } from '../constants/tema';

function GaleriFotografi({ url, sira, genislik }: { url: string | null; sira: number; genislik: number }) {
  const [hata, hatayiAyarla] = useState(false);
  return <View style={{ width: genislik, gap: 8 }}>
    {url && !hata ? <Image source={{ uri: url }} resizeMode="contain" style={stiller.fotograf}
      accessibilityLabel={`Anı fotoğrafı ${sira + 1}`} onError={() => hatayiAyarla(true)} />
      : <View style={[stiller.fotograf, stiller.yedek]}><Text style={stiller.metin}>Fotoğraf yüklenemedi. Yenile ile tekrar deneyebilirsin.</Text></View>}
    <Text style={stiller.metin}>Fotoğraf {sira + 1}</Text>
  </View>;
}

export function AniGalerisi({ fotograflar, secili = 0, degistir }: { fotograflar: AniDetayi['fotograflar']; secili?: number; degistir?: (sira: number) => void }) {
  const [genislik, ayarla] = useState(0);
  const kaydirici = useRef<ScrollView>(null);
  useEffect(() => { if (genislik > 0) kaydirici.current?.scrollTo({ x: secili * genislik, animated: false }); }, [secili, genislik]);
  return <View onLayout={(olay) => ayarla(olay.nativeEvent.layout.width)} style={{ gap: 10 }}>
    {genislik > 0 && <ScrollView ref={kaydirici} horizontal pagingEnabled showsHorizontalScrollIndicator={fotograflar.length > 1}
      onMomentumScrollEnd={(olay) => degistir?.(Math.max(0, Math.min(fotograflar.length - 1, Math.round(olay.nativeEvent.contentOffset.x / genislik))))}>
      {fotograflar.map((fotograf, sira) => <GaleriFotografi key={`${fotograf.yol}-${fotograf.url}`}
        url={fotograf.url} sira={sira} genislik={genislik} />)}
    </ScrollView>}
    <Text style={stiller.metin}>{fotograflar.length} fotoğraf{fotograflar.length > 1 ? ' · Diğer fotoğraflar için yana kaydır' : ''}</Text>
  </View>;
}
const stiller = StyleSheet.create({
  fotograf: { width: '100%', aspectRatio: 1, borderRadius: 24, backgroundColor: RENKLER.yumusak },
  yedek: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  metin: { color: RENKLER.ikincil, lineHeight: 22 },
});
