export type AnalizDurumu = 'not_required' | 'awaiting_nfc' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
// Pasif tarihsel kodlar da okunabilir; UI merkezi katalog ile daraltır.
export interface ApiDuygu { id: string; code: string; display_name_tr: string; color_hex: string; is_active: boolean; category_kind: 'model' | 'fallback' | 'legacy' }
export interface AnalizBilgisi {
  memory_id: string; status: AnalizDurumu; predicted_emotion: ApiDuygu | null;
  predicted_confidence: number | null; final_emotion: ApiDuygu | null; final_emotion_source: string | null;
  model_version: string | null; analyzed_at: string | null; version: number;
  job_id: string | null; trigger_source: string | null; error_code: string | null;
}
export interface ApiAni {
  id: string; user_id: string; title: string; description: string | null; memory_date: string;
  created_at: string; sphere_id: string | null; analysis_status: AnalizDurumu; version: number;
  predicted_emotion: ApiDuygu | null; final_emotion: ApiDuygu | null;
  photos: { storage_path: string; sort_order: number }[]; cover: { storage_path: string; sort_order: number } | null;
}
