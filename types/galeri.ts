import type { DuyguKodu } from '../constants/duyguSunumu';
export interface GaleriAnisi {
  id: string;
  baslik: string;
  tarih: string;
  duygu: DuyguKodu | null;
  kapak: string | null;
  fotografYolu?: string;
  fotografSirasi?: number;
}
export interface GaleriSayfasi { anilar: GaleriAnisi[]; devamVar: boolean; toplam: number; buAy: number; fotografUyarisi: boolean; sonrakiBaslangic?: number }
