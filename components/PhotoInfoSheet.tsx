import { ActivityIndicator, Animated, ScrollView, Text, View } from 'react-native';
import { Dugme } from './Dugme';
import { ORTAK, RENKLER } from '../constants/tema';
import { duyguSunumu } from '../constants/duyguSunumu';
import type { ViewerAnisi } from '../hooks/useViewerAnisi';

export function PhotoInfoSheet({ bilgi, konum, yukseklik, duzenle, hata }: {
  bilgi: ViewerAnisi | null; konum: Animated.Value; yukseklik: number; duzenle: () => void; hata?: string | null;
}) {
  const ani = bilgi?.ani;
  const zemin = duyguSunumu(bilgi?.duygu)?.zemin ?? RENKLER.ana;
  return <Animated.View accessibilityViewIsModal style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
    height: yukseklik, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: zemin, transform: [{ translateY: konum }] }}>
    <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF99' }} />
    </View>
    <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
      {ani && bilgi ? <>
      <Text accessibilityRole="header" style={[ORTAK.baslik, { color: '#FFFFFF' }]}>{ani.title}</Text>
      <Text style={[ORTAK.metin, { color: '#FFFFFF' }]}>{new Date(`${ani.memory_date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      <Text style={[ORTAK.metin, { color: '#FFFFFF' }]}>{ani.description || 'Açıklama eklenmemiş.'}</Text>
      <Dugme baslik="Anıyı düzenle" tiklaninca={duzenle} />
      </> : hata ? <Text accessibilityRole="alert" style={[ORTAK.hata, { color: '#FFFFFF' }]}>{hata}</Text> : <ActivityIndicator color="#FFFFFF" accessibilityLabel="Fotoğraf bilgileri yükleniyor" />}
    </ScrollView>
  </Animated.View>;
}
