import { TextInput } from 'react-native';
import type { TarihOzellikleri } from './AniTarihi';
import { RENKLER } from '../constants/tema';

export function AniTarihi({ deger, degistir, devreDisi }: TarihOzellikleri) {
  return <TextInput accessibilityLabel="Anı tarihi, yıl-ay-gün" value={deger}
    onChangeText={degistir} editable={!devreDisi} placeholder="YYYY-MM-DD" maxLength={10}
    style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#D4CDDD', color: RENKLER.yazi }} />;
}
