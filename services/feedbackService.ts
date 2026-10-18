import { apiIstegi } from './apiClient';
import { analizYanitiniDogrula } from './analysisService';
import type { DuyguKodu } from '../constants/duyguSunumu';
import type { AnalizBilgisi } from '../types/analiz';
export async function duyguGeriBildirimi(id: string, correctedEmotion: DuyguKodu, version: number, sinyal?: AbortSignal) {
  const sonuc = await apiIstegi<{ analysis: AnalizBilgisi; changed: boolean; feedback_id: string | null }>(
    `/v1/memories/${encodeURIComponent(id)}/emotion-feedback`,{ yontem:'POST',
      govde:{ corrected_emotion_code: correctedEmotion, expected_version:version },sinyal });
  return { ...sonuc, analysis:analizYanitiniDogrula(sonuc.analysis,id) };
}
