import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { RENKLER } from '../constants/tema';
import type { AniOzeti } from '../types/ani';

export function AniKarti({ ani }: { ani: AniOzeti }) {
  const [hataliAdres, hatayiAyarla] = useState<string | null>(null);
  return <Pressable style={stiller.kart} accessibilityRole="button" accessibilityLabel={`${ani.title}, anı detayını aç`}
    onPress={() => router.push({ pathname: '/ani/[id]', params: { id: ani.id } })}>
    {ani.fotografUrl && hataliAdres !== ani.fotografUrl
      ? <Image source={{ uri: ani.fotografUrl }} resizeMode="cover" style={stiller.fotograf}
        accessibilityLabel={`${ani.title} kapak fotoğrafı`} onError={() => hatayiAyarla(ani.fotografUrl)} />
      : <View style={[stiller.fotograf, stiller.yedek]}>
        <Text style={stiller.tarih}>Fotoğraf gösterilemedi. Listeyi yenileyebilirsin.</Text>
      </View>}
    <View style={stiller.metin}>
      <Text style={stiller.baslik}>{ani.title}</Text>
      <Text style={stiller.tarih}>{new Date(`${ani.memory_date}T12:00:00`).toLocaleDateString('tr-TR')}</Text>
    </View>
  </Pressable>;
}

const stiller = StyleSheet.create({
  kart: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' },
  fotograf: { width: '100%', aspectRatio: 1.5 },
  yedek: { backgroundColor: '#EAE4EF', alignItems: 'center', justifyContent: 'center', padding: 24 },
  metin: { padding: 20, gap: 8 },
  baslik: { color: RENKLER.yazi, fontSize: 20, fontWeight: '600' },
  tarih: { color: RENKLER.ikincil, fontSize: 14, lineHeight: 22 },
});
