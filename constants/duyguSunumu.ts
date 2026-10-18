// zemin: sabit duygu rengi; renk: bu zemin üzerinde WCAG AA metin rengi.
export const DUYGU_SUNUMU = [
  { kod: 'anger', ad: 'Öfke', ikon: '😡', zemin: '#E53935', renk: '#000000', modelSinifi: true },
  { kod: 'shame', ad: 'Utanç', ikon: '😳', zemin: '#FB8C00', renk: '#111111', modelSinifi: true },
  { kod: 'joy', ad: 'Neşe', ikon: '😊', zemin: '#FDD835', renk: '#111111', modelSinifi: true },
  { kod: 'disgust', ad: 'Tiksinti', ikon: '🤢', zemin: '#43A047', renk: '#111111', modelSinifi: true },
  { kod: 'sadness', ad: 'Üzüntü', ikon: '😢', zemin: '#1E88E5', renk: '#111111', modelSinifi: true },
  { kod: 'surprise', ad: 'Şaşkınlık', ikon: '😲', zemin: '#1A237E', renk: '#FFFFFF', modelSinifi: true },
  { kod: 'fear', ad: 'Korku', ikon: '😨', zemin: '#8E24AA', renk: '#FFFFFF', modelSinifi: true },
  { kod: 'alexithymia', ad: 'Aleksitimi', ikon: '😶', zemin: '#111111', renk: '#FFFFFF', modelSinifi: false },
] as const;
export type DuyguKodu = (typeof DUYGU_SUNUMU)[number]['kod'];
export type ModelDuyguKodu = Exclude<DuyguKodu, 'alexithymia'>;
export type DuyguFiltresi = DuyguKodu | 'tumu';
export const MODEL_DUYGULARI = DUYGU_SUNUMU.filter((duygu) => duygu.modelSinifi);
export function duyguSunumu(kod: string | null | undefined) {
  return DUYGU_SUNUMU.find((duygu) => duygu.kod === kod);
}
// Eski kayıtları değiştirmez; yalnızca eşdeğer kategorinin yeni sunumunu sağlar.
export function eskiDuyguKodu(kod: string | undefined): DuyguKodu | null {
  if (kod === 'mutluluk' || kod === 'happiness') return 'joy';
  if (kod === 'huzun') return 'sadness';
  return duyguSunumu(kod)?.kod ?? null;
}
