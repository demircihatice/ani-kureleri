import { useState } from 'react';
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

export function AniGalerisi({ fotograflar }: { fotograflar: AniDetayi['fotograflar'] }) {
  const [genislik, ayarla] = useState(0);
  return <View onLayout={(olay) => ayarla(olay.nativeEvent.layout.width)} style={{ gap: 10 }}>
    {genislik > 0 && <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={fotograflar.length > 1}>
      {fotograflar.map((fotograf, sira) => <GaleriFotografi key={`${fotograf.yol}-${fotograf.url}`}
        url={fotograf.url} sira={sira} genislik={genislik} />)}
    </ScrollView>}
    <Text style={stiller.metin}>{fotograflar.length} fotoğraf{fotograflar.length > 1 ? ' · Diğer fotoğraflar için yana kaydır' : ''}</Text>
  </View>;
}
const stiller = StyleSheet.create({
  fotograf: { width: '100%', aspectRatio: 1, borderRadius: 20, backgroundColor: '#EAE4EF' },
  yedek: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  metin: { color: RENKLER.ikincil, lineHeight: 22 },
});
