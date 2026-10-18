import { Pressable, ScrollView, Text, View } from 'react-native';
import { DUYGU_SUNUMU, duyguSunumu, type DuyguFiltresi, type DuyguKodu } from '../../constants/duyguSunumu';
import { ORTAK, RENKLER } from '../../constants/tema';
import { Dugme } from '../Dugme';

export function DuyguEtiketi({ kod }: { kod: DuyguKodu | null }) {
  const duygu = duyguSunumu(kod);
  return <Text style={{ color: duygu?.renk ?? RENKLER.ikincil, backgroundColor: duygu?.zemin ?? RENKLER.yumusak,
    borderRadius: 12, paddingVertical: 5, paddingHorizontal: 8, fontSize: 11, alignSelf: 'flex-start' }}>
    {duygu ? `${duygu.ikon} ${duygu.ad}` : 'Duygu belirtilmemiş'}
  </Text>;
}
export function DuyguFiltreleri({ secili, sec }: { secili: DuyguFiltresi; sec: (kod: DuyguFiltresi) => void }) {
  const liste = [{ kod: 'tumu' as const, ad: 'Tümü', ikon: '▦', zemin: '#FFFFFF', renk: '#111111' }, ...DUYGU_SUNUMU];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 52, flexGrow: 0, flexShrink: 0 }}
    contentContainerStyle={{ gap: 8, paddingVertical: 4, alignItems: 'center' }}>
    {liste.map((duygu) => <Pressable key={duygu.kod} accessibilityRole="button" accessibilityLabel={duygu.ad}
      accessibilityState={{ selected: secili === duygu.kod }} onPress={() => sec(duygu.kod)}
      style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 24,
        borderWidth: 2, borderColor: secili === duygu.kod ? '#111111' : '#D7D7D7',
        backgroundColor: duygu.zemin }}>
      <Text style={{ color: duygu.renk, fontSize: 13 }}>{duygu.ikon} {duygu.ad}{secili === duygu.kod ? ' ✓' : ''}</Text>
    </Pressable>)}
  </ScrollView>;
}
// Veri işlemini servis çağıran ekran yapar; ortak kartlar yalnızca seçimi sunar.
export function DuyguDuzenleyici({ secili, sec, kaydet, bekliyor = false }:
  { secili: DuyguKodu | null; sec: (kod: DuyguKodu) => void; kaydet?: () => void; bekliyor?: boolean }) {
  return <View style={{ gap: 16 }}>
    <Text style={ORTAK.baslik}>Duyguyu Değiştir</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{DUYGU_SUNUMU.map((duygu) =>
      <Pressable key={duygu.kod} accessibilityRole="radio" accessibilityLabel={duygu.ad}
        accessibilityState={{ checked: secili === duygu.kod, disabled: bekliyor }} disabled={bekliyor} onPress={() => sec(duygu.kod)}
        style={{ width: '31%', flexGrow: 1, padding: 14, minHeight: 100, borderRadius: 20, alignItems: 'center', gap: 10,
          backgroundColor: duygu.zemin, borderWidth: 2, borderColor: secili === duygu.kod ? RENKLER.ana : 'transparent' }}>
        <Text style={{ color: duygu.renk, fontSize: 28 }}>{duygu.ikon}</Text>
        <Text style={{ color: duygu.renk, fontSize: 13 }}>{duygu.ad}{secili === duygu.kod ? ' ✓' : ''}</Text>
      </Pressable>)}</View>
    {!kaydet && <Text style={ORTAK.metin}>Duygu değişikliklerini kaydetme yakında kullanılabilecek.</Text>}
    <Dugme baslik="Değişikliği Kaydet" devreDisi={!kaydet || !secili} bekliyor={bekliyor} tiklaninca={() => kaydet?.()} />
  </View>;
}
