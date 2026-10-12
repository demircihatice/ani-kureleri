import type { DuyguTuru } from './duygu';

export interface KureOzeti {
  id: string;
  name: string;
  emotion_type: DuyguTuru;
  aniSayisi: number;
}

export interface KureSetiOzeti {
  id: string;
  name: string;
  kureler: KureOzeti[];
}

export interface KureSetiSatiri {
  id: string;
  name: string;
  spheres: {
    id: string;
    name: string;
    emotion_type: DuyguTuru;
    memories: { count: number }[];
  }[];
}
