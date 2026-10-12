import { useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Dugme } from './Dugme';
import { yerelTarih } from '../lib/aniDogrulama';

export interface TarihOzellikleri { deger: string; degistir: (tarih: string) => void; devreDisi: boolean }

export function AniTarihi({ deger, degistir, devreDisi }: TarihOzellikleri) {
  const [acik, acigiAyarla] = useState(false);
  const tarih = new Date(`${deger}T12:00:00`);
  return <View style={{ gap: 8 }}>
    <Dugme baslik={tarih.toLocaleDateString('tr-TR')} ikincil devreDisi={devreDisi} tiklaninca={() => acigiAyarla(!acik)} />
    {acik && !devreDisi && <DateTimePicker value={tarih} mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={(olay, secilen) => {
        if (Platform.OS !== 'ios') acigiAyarla(false);
        if (olay.type === 'set' && secilen) degistir(yerelTarih(secilen));
      }} />}
  </View>;
}
