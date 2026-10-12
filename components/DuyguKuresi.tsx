import { StyleSheet, Text, View } from 'react-native';
import { DuyguTanimi } from '../types/duygu';
import { RENKLER } from '../constants/tema';

export function DuyguKuresi({ duygu }: { duygu: DuyguTanimi }) {
  return (
    <View style={stiller.alan}>
      <View style={[stiller.kure, { backgroundColor: duygu.renk }]}>
        <View style={stiller.parilti} />
      </View>
      <Text style={stiller.ad}>{duygu.ad}</Text>
    </View>
  );
}

const stiller = StyleSheet.create({
  alan: { alignItems: 'center', gap: 14 },
  kure: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: '#FFFFFF', padding: 14 },
  parilti: { width: 22, height: 14, borderRadius: 12, backgroundColor: '#FFFFFF80', transform: [{ rotate: '-35deg' }] },
  ad: { color: RENKLER.yazi, fontSize: 14, fontWeight: '500' },
});
