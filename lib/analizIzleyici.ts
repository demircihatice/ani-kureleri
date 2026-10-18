import type { AnalizBilgisi } from '../types/analiz';
// Tek seferde bir istek, ardından bekleme. İptal edilmiş yanıt state'e ulaşmaz.
export function analiziIzle({ getir, degisti, hata, zamanDoldu, aralik = 5000, sure = 90000 }:
  { getir: (sinyal: AbortSignal) => Promise<AnalizBilgisi>; degisti: (veri: AnalizBilgisi) => void;
    hata: (sorun: unknown) => void; zamanDoldu: () => void; aralik?: number; sure?: number }) {
  const kontrol = new AbortController();
  const baslangic = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function oku() {
    if (kontrol.signal.aborted) return;
    try {
      const veri = await getir(kontrol.signal);
      if (kontrol.signal.aborted) return;
      degisti(veri);
      if (kontrol.signal.aborted) return;
      if (!['awaiting_nfc','queued','processing'].includes(veri.status)) return;
      if (Date.now()-baslangic >= sure) { zamanDoldu(); return; }
      timer = setTimeout(() => void oku(),aralik);
    } catch (sorun) { if (!kontrol.signal.aborted) hata(sorun); }
  }
  void oku();
  return () => { kontrol.abort(); if (timer !== undefined) clearTimeout(timer); };
}
