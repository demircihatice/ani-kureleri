import type { AnalizDurumu } from './analiz';

export interface SecilenFotograf {
  uri: string;
  width: number;
  height: number;
}

export interface AniFormu {
  baslik: string;
  aciklama: string;
  tarih: string;
  kureId: string;
  fotograflar: SecilenFotograf[];
}

export interface AniDenemesi {
  id: string;
  kullaniciId: string;
  form: AniFormu;
  yollar: string[];
  yuklemeTamam: boolean;
}

export interface AniSatiri {
  id: string;
  title: string;
  memory_date: string;
  image_url: string;
}

export interface AniOzeti extends AniSatiri {
  fotografUrl: string | null;
}

export interface AniListeSatiri extends AniSatiri {
  memory_images: { storage_path: string; sort_order: number }[];
}

export interface AniSayfasi {
  anilar: AniOzeti[];
  devamVar: boolean;
  toplam: number;
  fotografUyarisi: boolean;
}

export interface AniDuzenleme { baslik: string; aciklama: string; tarih: string; kureId: string }
export interface AniGuncellenen {
  id: string; title: string; description: string | null; memory_date: string; sphere_id: string | null; version?: number;
}
export interface AniDetaySatiri extends AniGuncellenen {
  image_url: string;
  memory_images: { id: string; storage_path: string; sort_order: number }[];
}
export interface AniDetayi extends AniGuncellenen {
  analizDurumu?: AnalizDurumu;
  fotograflar: { yol: string; url: string | null }[];
}
