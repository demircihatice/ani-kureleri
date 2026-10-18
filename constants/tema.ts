export const RENKLER = {
  zemin: '#FFFFFF',
  yuzey: '#FFFFFF',
  yumusak: '#F5F5F5',
  yazi: '#202020',
  ikincil: '#686868',
  ana: '#333333',
  anaKoyu: '#111111',
  kenar: '#E5E5E5',
  tehlike: '#A13738',
} as const;

export const ORTAK = {
  baslik: { fontSize: 28, fontWeight: '700', color: RENKLER.yazi },
  metin: { fontSize: 14, lineHeight: 23, color: RENKLER.ikincil },
  etiket: { fontSize: 14, fontWeight: '600', color: RENKLER.yazi },
  girdi: { minHeight: 52, borderWidth: 1, borderColor: RENKLER.kenar, borderRadius: 16,
    padding: 14, fontSize: 16, color: RENKLER.yazi, backgroundColor: '#FAFAFA' },
  kart: { padding: 20, borderRadius: 20, borderWidth: 1, borderColor: RENKLER.kenar, backgroundColor: RENKLER.yuzey, gap: 12 },
  hata: { color: RENKLER.tehlike, lineHeight: 23 },
} as const;
