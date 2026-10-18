import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform } from 'react-native';

export function useFotoBilgiPaneli(yukseklik: number) {
  const [acik, ayarla] = useState(false);
  const [konum] = useState(() => new Animated.Value(yukseklik));
  const durum = useRef({ acik: false, baslangictaAcik: false });
  const yerlestir = useCallback((goster: boolean) => {
    konum.stopAnimation();
    durum.current.acik = goster;
    if (goster) ayarla(true);
    Animated.timing(konum, { toValue: goster ? 0 : yukseklik, duration: 220, useNativeDriver: Platform.OS !== 'web' })
      .start(({ finished }) => { if (finished && !goster) ayarla(false); });
  }, [konum, yukseklik]);
  const yakala = useCallback((_: unknown, g: { dx: number; dy: number; numberActiveTouches: number }) =>
    g.numberActiveTouches === 1 && Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4 &&
    (durum.current.acik ? g.dy > 0 : g.dy < 0), []);
  const baslat = useCallback(() => {
    durum.current.baslangictaAcik = durum.current.acik;
    konum.stopAnimation();
    ayarla(true);
  }, [konum]);
  const hareket = useCallback((_: unknown, g: { dy: number }) => {
    konum.setValue(Math.max(0, Math.min(yukseklik, (durum.current.baslangictaAcik ? 0 : yukseklik) + g.dy)));
  }, [konum, yukseklik]);
  const birak = useCallback((_: unknown, g: { dy: number }) => {
    yerlestir(durum.current.baslangictaAcik ? g.dy < 60 : g.dy < -60);
  }, [yerlestir]);
  // PanResponder.create callback'leri kaydeder; ref render sırasında okunmaz.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({ onMoveShouldSetPanResponderCapture: yakala,
    onPanResponderGrant: baslat, onPanResponderMove: hareket, onPanResponderRelease: birak,
    onPanResponderTerminate: () => yerlestir(false), onPanResponderTerminationRequest: () => false }),
  [yakala, baslat, hareket, birak, yerlestir]);
  useEffect(() => () => konum.stopAnimation(), [konum]);
  return { acik, konum, panHandlers: responder.panHandlers, ac: () => yerlestir(true), kapat: useCallback(() => yerlestir(false), [yerlestir]) };
}
