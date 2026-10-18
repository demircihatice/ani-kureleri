import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { GaleriAnisi } from '../../types/galeri';
import { RENKLER } from '../../constants/tema';
import { DuyguEtiketi } from './DuyguSecimi';
function GaleriKarti({ ani }: { ani: GaleriAnisi }) {
  const [hata, hatayiAyarla] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${ani.baslik}, ${ani.tarih}. Anıyı aç`}
    onPress={() => router.push({ pathname: '/ani/[id]', params: { id: ani.id } })} style={s.kart}>
    {ani.kapak && !hata ? <Image source={{ uri: ani.kapak }} style={s.fotograf} accessibilityLabel={ani.baslik} onError={() => hatayiAyarla(true)} />
      : <View style={[s.fotograf, s.yedek]}><Text style={s.tarih}>Fotoğraf açılamadı</Text></View>}
    <Text numberOfLines={2} style={s.baslik}>{ani.baslik}</Text>
    <Text style={s.tarih}>{new Date(`${ani.tarih}T12:00:00`).toLocaleDateString('tr-TR')}</Text>
    <DuyguEtiketi kod={ani.duygu} />
  </Pressable>;
}
export function FotografIzgarasi({ anilar }: { anilar: GaleriAnisi[] }) {
  const satirlar = Array.from({ length: Math.ceil(anilar.length / 3) }, (_, sira) => anilar.slice(sira * 3, sira * 3 + 3));
  return <View accessibilityLabel="Anı galerisi, 3 sütun" style={{ gap: 18 }}>
    {satirlar.map((satir, i) => <View key={i} style={s.satir}>{[0, 1, 2].map((j) => <View key={j} style={s.hucre}>
      {satir[j] && <GaleriKarti key={`${satir[j].id}:${satir[j].kapak}`} ani={satir[j]} />}
    </View>)}</View>)}
  </View>;
}
const s = StyleSheet.create({
  satir: { flexDirection: 'row', gap: 8 }, hucre: { flex: 1, minWidth: 0 }, kart: { gap: 7 },
  fotograf: { width: '100%', aspectRatio: 0.84, borderRadius: 18, backgroundColor: RENKLER.yumusak },
  yedek: { justifyContent: 'center', alignItems: 'center' },
  baslik: { fontSize: 13, fontWeight: '600', color: RENKLER.yazi }, tarih: { color: RENKLER.ikincil, fontSize: 11 },
});
