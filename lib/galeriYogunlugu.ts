export const GRID_SEVIYELERI = [2, 3, 4, 5, 6] as const;
export const BASLANGIC_SUTUNU = 5;
// İki parmağın mesafe oranı; dokunma gürültüsü için %22 eşiği.
// Duygu güven eşiğiyle ilişkisi yoktur; yalnızca görsel hareket kararlılığıdır.
export function pinchSutunu(sutun: number, oran: number) {
  if (!Number.isFinite(oran) || oran <= 0) return sutun;
  const adim = Math.trunc(Math.log(oran) / Math.log(1.22));
  return Math.max(2, Math.min(6, sutun - adim));
}
export function gridCapasi(offset: number, genislik: number, onceki: number, sonraki: number) {
  const oncekiSatir = (genislik + 2) / onceki;
  const sonrakiSatir = (genislik + 2) / sonraki;
  const ilkFotograf = Math.floor(Math.max(0, offset) / oncekiSatir) * onceki;
  return Math.floor(ilkFotograf / sonraki) * sonrakiSatir;
}
