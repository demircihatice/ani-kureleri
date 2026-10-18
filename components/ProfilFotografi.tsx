import { useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useProfilFotografi } from '../hooks/useProfilFotografi';
import { profilFotografiSec, profilFotografiniKaydet } from '../services/profilePhotoService';
import { ORTAK, RENKLER } from '../constants/tema';
import { Dugme } from './Dugme';

export function ProfilFotografi({ kullaniciId, yol, ad, beklemeDegisti }:
  {kullaniciId: string; yol: unknown; ad: string; beklemeDegisti: (deger: boolean) => void}) {
  const [kayitliYol, yolAyarla] = useState<string | null>(null);
  const {url, hata: okumaHatasi, yenile} = useProfilFotografi(kullaniciId, kayitliYol ?? yol);
  const [bekliyor, ayarla] = useState(false);
  const [hata, hatayiAyarla] = useState<string | null>(null);
  const [bozukUrl, bozukAyarla] = useState<string | null>(null);
  const istek = useRef(false);
  usePreventRemove(bekliyor, () => Alert.alert('Fotoğraf kaydediliyor', 'İşlem tamamlanana kadar bekle.'));
  async function sec() {
    if (istek.current) return;
    istek.current = true; ayarla(true); beklemeDegisti(true); hatayiAyarla(null);
    try {
      const foto = await profilFotografiSec();
      if (foto) yolAyarla(await profilFotografiniKaydet(kullaniciId, foto));
    } catch (sorun) { hatayiAyarla(sorun instanceof Error ? sorun.message : 'Fotoğraf kaydedilemedi.'); }
    finally { istek.current = false; ayarla(false); beklemeDegisti(false); }
  }
  return <View style={{alignItems: 'center', gap: 10}}>
    <View style={{ width: 96, height: 110 }}>
    <View style={{width: 96, height: 96, borderRadius: 48, backgroundColor: RENKLER.yumusak, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
      {url && url !== bozukUrl ? <Image source={{uri: url}} accessibilityLabel="Profil fotoğrafın" resizeMode="cover"
        onError={() => bozukAyarla(url)} style={{width: '100%', height: '100%'}} />
        : ad === 'Ad belirtilmedi' ? <Ionicons name="person-outline" size={32} color={RENKLER.ana} accessible={false} />
          : <Text style={{fontSize: 32, color: RENKLER.ana}}>{ad[0].toLocaleUpperCase('tr-TR')}</Text>}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Profil fotoğrafını değiştir" disabled={bekliyor}
      accessibilityState={{ disabled: bekliyor, busy: bekliyor }} onPress={() => void sec()}
      style={{ position: 'absolute', right: -14, bottom: 0, width: 44, height: 44, borderRadius: 22,
        borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', backgroundColor: RENKLER.ana }}>
      {bekliyor ? <ActivityIndicator color="#FFFFFF" accessibilityLabel="Profil fotoğrafı kaydediliyor" />
        : <Ionicons name="pencil" size={19} color="#FFFFFF" accessible={false} />}
    </Pressable></View>
    {(hata || okumaHatasi || (url && url === bozukUrl)) && <><Text accessibilityRole="alert" style={ORTAK.hata}>{hata ?? okumaHatasi ?? 'Profil fotoğrafı açılamadı.'}</Text>
      <Dugme baslik="Fotoğrafı yenile" ikincil devreDisi={bekliyor} tiklaninca={() => { hatayiAyarla(null); bozukAyarla(null); yenile(); }} /></>}
  </View>;
}
