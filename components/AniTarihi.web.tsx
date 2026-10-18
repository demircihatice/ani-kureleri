import { createElement, type ChangeEvent } from 'react';
import type { TarihOzellikleri } from './AniTarihi';
import { RENKLER } from '../constants/tema';

export function AniTarihi({ deger, degistir, devreDisi, enGec }: TarihOzellikleri) {
  return createElement('input', { type: 'date', 'aria-label': 'Anı tarihi, yıl-ay-gün', value: deger,
    max: enGec, disabled: devreDisi,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (!enGec || e.target.value <= enGec) degistir(e.target.value);
    },
    style: { minHeight: 48, width: '100%', boxSizing: 'border-box', border: `1px solid ${RENKLER.kenar}`,
      borderRadius: 14, padding: 12, font: 'inherit', color: RENKLER.yazi, backgroundColor: RENKLER.yuzey },
  });
}
