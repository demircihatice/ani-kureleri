import { useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import type { AniDetayi } from '../types/ani';

export function ThumbnailStrip({ fotograflar, secili, sec, dahaFazla, yukleniyor = false, hata }: {
  fotograflar: AniDetayi['fotograflar']; secili: number; sec: (sira: number) => void;
  dahaFazla?: () => void; yukleniyor?: boolean; hata?: string | null;
}) {
  const ref = useRef<FlatList<AniDetayi['fotograflar'][number]>>(null);
  useEffect(() => { ref.current?.scrollToIndex({ index: secili, viewPosition: 0.5, animated: true }); }, [secili]);
  return <FlatList ref={ref} horizontal accessibilityLabel="Fotoğraf küçük resimleri" showsHorizontalScrollIndicator={false}
    data={fotograflar} extraData={secili} initialScrollIndex={secili} initialNumToRender={20} maxToRenderPerBatch={20} windowSize={1}
    getItemLayout={(_, index) => ({ length: 26, offset: index * 26, index })} keyExtractor={f => f.yol}
    onEndReached={() => { if (!yukleniyor && !hata) dahaFazla?.(); }} onEndReachedThreshold={0.5}
    style={{ flexGrow: 0, height: 52 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 4, alignItems: 'center' }}
    ListFooterComponent={yukleniyor ? <ActivityIndicator accessibilityLabel="Diğer fotoğraflar yükleniyor" color="#333333" style={{ padding: 16 }} /> : hata ?
      <Pressable accessibilityRole="button" accessibilityLabel="Diğer fotoğrafları tekrar yükle" onPress={dahaFazla} style={{ padding: 16 }}><Text style={{ color: '#333333' }}>Tekrar dene</Text></Pressable> : null}
    renderItem={({ item: f, index: i }) => <Pressable accessibilityRole="button" accessibilityLabel={`Fotoğraf ${i + 1} aç`}
      accessibilityState={{ selected: secili === i }} onPress={() => sec(i)}
      style={{ width: 24, height: 44, marginHorizontal: 1, opacity: secili === i ? 1 : 0.65, transform: [{ scaleY: secili === i ? 1 : 0.82 }], overflow: 'hidden' }}>
      {f.url ? <Image source={{ uri: f.url }} resizeMode="cover" resizeMethod="resize" style={{ width: '100%', height: '100%' }} />
        : <View style={{ flex: 1, backgroundColor: '#EEEEEE', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#333333' }}>{i + 1}</Text></View>}
    </Pressable>} />;
}
