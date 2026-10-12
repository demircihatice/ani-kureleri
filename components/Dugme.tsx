import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { RENKLER } from '../constants/tema';

interface DugmeOzellikleri {
  baslik: string;
  tiklaninca: () => void;
  bekliyor?: boolean;
  ikincil?: boolean;
  devreDisi?: boolean;
}

export function Dugme({ baslik, tiklaninca, bekliyor = false, ikincil = false, devreDisi = false }: DugmeOzellikleri) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={baslik}
      accessibilityState={{ disabled: bekliyor || devreDisi, busy: bekliyor }} disabled={bekliyor || devreDisi}
      onPress={tiklaninca}
      style={({ pressed }) => [stiller.dugme, ikincil && stiller.ikincil, (pressed || bekliyor || devreDisi) && { opacity: 0.65 }]}>
      {bekliyor ? <ActivityIndicator color={ikincil ? RENKLER.yazi : '#FFFFFF'} />
        : <Text style={[stiller.yazi, ikincil && { color: RENKLER.yazi }]}>{baslik}</Text>}
    </Pressable>
  );
}

const stiller = StyleSheet.create({
  dugme: { minHeight: 50, padding: 14, borderRadius: 16, backgroundColor: RENKLER.yazi, alignItems: 'center', justifyContent: 'center' },
  ikincil: { backgroundColor: '#EAE4EF' },
  yazi: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
