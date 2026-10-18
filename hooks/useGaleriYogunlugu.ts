import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, type FlatList, type GestureResponderEvent, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { GaleriAnisi } from '../types/galeri';
import { BASLANGIC_SUTUNU, gridCapasi, pinchSutunu } from '../lib/galeriYogunlugu';

function mesafe(e: GestureResponderEvent) {
  const [a, b] = e.nativeEvent.touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : null;
}
export function useGaleriYogunlugu() {
  const [sutun, ayarla] = useState(BASLANGIC_SUTUNU);
  const [pinch, pinchAyarla] = useState(false);
  const [genislik, genislikAyarla] = useState(0);
  const listeRef = useRef<FlatList<GaleriAnisi | null>>(null);
  const durum = useRef({ sutun: BASLANGIC_SUTUNU, genislik: 1, offset: 0, hedef: 0, ilkMesafe: 0, ilkSutun: BASLANGIC_SUTUNU });
  const degistir = useCallback((yeni: number) => {
    const d = durum.current;
    if (yeni === d.sutun) return;
    d.hedef = gridCapasi(d.offset, d.genislik, d.sutun, yeni);
    d.offset = d.hedef;
    d.sutun = yeni;
    ayarla(yeni);
  }, []);
  const baslat = useCallback((e: GestureResponderEvent) => {
      durum.current.ilkMesafe = mesafe(e) ?? 0;
      durum.current.ilkSutun = durum.current.sutun;
      pinchAyarla(true);
    }, []);
  const hareket = useCallback((e: GestureResponderEvent) => {
      const m = mesafe(e), d = durum.current;
      if (m && d.ilkMesafe) degistir(pinchSutunu(d.ilkSutun, m / d.ilkMesafe));
    }, [degistir]);
  // Parent responder yalnızca iki parmağı yakalar. Tek parmak scroll/refresh serbesttir.
  // create sadece callback'leri saklar; ref okuması render'da değil dokunma olayında yapılır.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
    onPanResponderGrant: baslat,
    onPanResponderMove: hareket,
    onPanResponderRelease: () => pinchAyarla(false),
    onPanResponderTerminate: () => pinchAyarla(false),
    onPanResponderTerminationRequest: () => false,
  }), [baslat, hareket]);
  return { sutun, pinch, listeRef, satirYuksekligi: genislik > 0 ? (genislik + 2) / sutun : null, panHandlers: responder.panHandlers,
    sifirla: () => { durum.current.offset = 0; durum.current.hedef = 0; listeRef.current?.scrollToOffset({ offset: 0, animated: false }); },
    boyutDegisti: (e: LayoutChangeEvent) => { durum.current.genislik = e.nativeEvent.layout.width; genislikAyarla(e.nativeEvent.layout.width); },
    kaydirildi: (e: NativeSyntheticEvent<NativeScrollEvent>) => { durum.current.offset = e.nativeEvent.contentOffset.y; },
    capayiGeriYukle: () => {
      const d = durum.current;
      if (d.hedef > 0 && listeRef.current) {
        const offset = d.hedef;
        d.hedef = 0;
        d.offset = offset;
        listeRef.current.scrollToOffset({ offset, animated: false });
      }
    } };
}
