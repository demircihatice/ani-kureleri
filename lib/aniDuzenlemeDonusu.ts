import { randomUUID } from 'expo-crypto';

// Dönüş yalnızca düzenlemeyi açan, hâlâ açık olan fotoğraf ekranına bildirilir.
const donusler = new Map<string, { kullaniciId: string; aniId: string; bildir: (kaydedildi: boolean) => void }>();

export function duzenlemeDonusunuHazirla(kullaniciId: string, aniId: string, bildir: (kaydedildi: boolean) => void) {
  const kimlik = randomUUID();
  donusler.set(kimlik, { kullaniciId, aniId, bildir });
  return { kimlik, temizle: () => { donusler.delete(kimlik); } };
}

export function duzenlemeDonusunuBildir(kimlik: string, kullaniciId: string, aniId: string, kaydedildi: boolean) {
  const donus = donusler.get(kimlik);
  if (!donus || donus.kullaniciId !== kullaniciId || donus.aniId !== aniId) return;
  donusler.delete(kimlik);
  donus.bildir(kaydedildi);
}
