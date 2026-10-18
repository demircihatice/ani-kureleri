import { apiIstegi, ApiHatasi } from './apiClient';
import { duyguSunumu } from '../constants/duyguSunumu';
import type { AnalizBilgisi, AnalizDurumu } from '../types/analiz';
export const ANALIZ_DURUMLARI: AnalizDurumu[] = ['not_required','awaiting_nfc','queued','processing','completed','failed','cancelled'];
export function analizYanitiniDogrula(veri: AnalizBilgisi, id: string): AnalizBilgisi {
  if (!veri || veri.memory_id !== id || !ANALIZ_DURUMLARI.includes(veri.status) || !Number.isInteger(veri.version) || veri.version < 1 ||
    (veri.status === 'completed' && (!duyguSunumu(veri.predicted_emotion?.code)?.modelSinifi || !duyguSunumu(veri.final_emotion?.code) ||
      typeof veri.predicted_confidence !== 'number' || !Number.isFinite(veri.predicted_confidence) ||
      veri.predicted_confidence < 0 || veri.predicted_confidence > 1 || !veri.model_version?.trim() || !veri.analyzed_at))) {
    throw new ApiHatasi('Analiz yanıtı doğrulanamadı.', null, false);
  }
  return veri;
}
function yol(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new ApiHatasi('Anı kimliği geçersiz.',null,false);
  return `/v1/memories/${id}/analysis`;
}
export async function analizDurumunuGetir(id: string, sinyal?: AbortSignal) {
  return analizYanitiniDogrula(await apiIstegi<AnalizBilgisi>(yol(id),{ sinyal }),id);
}
export async function analiziBaslat(id: string, sinyal?: AbortSignal) {
  return analizYanitiniDogrula(await apiIstegi<AnalizBilgisi>(yol(id)+'/start',{ yontem:'POST',govde:{},sinyal }),id);
}
export async function kureyiSimuleEt(id: string, sinyal?: AbortSignal) {
  return analizYanitiniDogrula(await apiIstegi<AnalizBilgisi>(yol(id)+'/simulate-trigger',{ yontem:'POST',govde:{},sinyal }),id);
}
export const ANALIZ_METINLERI: Record<AnalizDurumu,string> = {
  awaiting_nfc:'Telefonunu Ana Küreye yaklaştır', queued:'Analiz sırasına alındı', processing:'Duygu algılanıyor...',
  completed:'Duygu Belirlendi', failed:'Analiz tamamlanamadı', cancelled:'Analiz iptal edildi', not_required:'Bu anı analiz beklemiyor',
};
