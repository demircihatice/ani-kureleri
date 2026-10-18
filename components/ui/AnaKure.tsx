import { StyleSheet, View } from 'react-native';
import { RENKLER } from '../../constants/tema';
export function AnaKure({ buyuk = false, renk = RENKLER.yumusak as string }: { buyuk?: boolean; renk?: string }) {
  return <View accessible accessibilityRole="image" accessibilityLabel="Ana Küre" style={s.alan}>
    <View style={[s.halka, buyuk && { width: 220, height: 220, borderRadius: 110 }]}>
      <View style={[s.kure, { backgroundColor: renk }, buyuk && { width: 170, height: 170, borderRadius: 85 }]}>
        <View style={s.parlama} /><View style={s.isik} />
      </View>
    </View><View style={s.taban} />
  </View>;
}
const s = StyleSheet.create({
  alan: { alignItems: 'center', paddingVertical: 12 },
  halka: { width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: RENKLER.kenar, alignItems: 'center', justifyContent: 'center' },
  kure: { width: 108, height: 108, borderRadius: 54, borderWidth: 1, borderColor: RENKLER.kenar, overflow: 'hidden', boxShadow: '0 12px 28px #00000014' },
  parlama: { position: 'absolute', width: '60%', height: '60%', borderRadius: 80, backgroundColor: RENKLER.yuzey, opacity: 0.65, top: '7%', left: '9%' },
  isik: { position: 'absolute', width: '100%', height: '35%', backgroundColor: RENKLER.ana, opacity: 0.12, bottom: 0 },
  taban: { width: 70, height: 9, borderRadius: 6, backgroundColor: RENKLER.kenar, marginTop: 10 },
});
