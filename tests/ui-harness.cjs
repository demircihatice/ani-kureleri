const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
// Native çalışma zamanı gerektirmeden gerçek TSX bileşen ağacını ve olaylarını çalıştırır.
function uiOrtami(ozel = {}, globals = {}) {
  const durumlar = new Map(), moduller = new Map(), etkiler = [], yollar = [];
  let mevcut, sira, kok, props;
  const hook = (ilk) => { const i = sira++; if (!(i in mevcut)) mevcut[i] = ilk(); return [mevcut, i]; };
  const ayni = (a, b) => a && b && a.length === b.length && a.every((d, i) => Object.is(d, b[i]));
  const react = {
    createElement: (type, props) => ({ type, props }),
    useState(ilk) { const [d, i] = hook(() => typeof ilk === 'function' ? ilk() : ilk); return [d[i], (yeni) => { d[i] = typeof yeni === 'function' ? yeni(d[i]) : yeni; }]; },
    useMemo(fn, deps) { const [d, i] = hook(() => ({ value: fn(), deps })); if (!ayni(d[i].deps, deps)) d[i] = { value: fn(), deps }; return d[i].value; },
    useRef(ilk) { const [d, i] = hook(() => ({ current: ilk })); return d[i]; },
    useCallback(fn, deps) { const [d, i] = hook(() => ({ fn, deps })); if (!ayni(d[i].deps, deps)) d[i] = { fn, deps }; return d[i].fn; },
    useEffect(fn, deps) { const [d, i] = hook(() => ({})); if (!ayni(d[i].deps, deps)) { etkiler.push(() => { d[i].temizle?.(); d[i].temizle = fn(); }); d[i].deps = deps; } },
  };
  const primitives = Object.fromEntries(['ActivityIndicator', 'Text', 'View', 'Image', 'Modal', 'Pressable', 'TextInput', 'ScrollView', 'FlatList', 'KeyboardAvoidingView'].map((s) => [s, s]));
  const oturum = { user: { id: 'user-a', email: 'test@example.invalid', user_metadata: { full_name: 'Test Kullanıcı' } } };
  const veri = { anilar: [], toplam: 0, buAy: 0, devamVar: false, fotografUyarisi: false };
  const dis = {
    react,
    'react/jsx-runtime': { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    '@expo/vector-icons/Ionicons': 'Ionicons',
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'react-native': { ...primitives,
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      Animated: { View: 'AnimatedView', Value: class { constructor(value) { this.value = value; } setValue(v) { this.value = v; } stopAnimation() {} },
        timing: (value, options) => ({ start: callback => { value.value = options.toValue; callback?.({ finished: true }); } }) },
      PanResponder: { create: (handlers) => ({ panHandlers: handlers }) }, StyleSheet: { create: (s) => s }, Platform: { OS: 'web' }, Alert: { alert() {} }, AppState: { addEventListener: () => ({ remove() {} }) } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', SafeAreaProvider: 'SafeAreaProvider' },
    'expo-router': { router: { push: (s) => yollar.push(s), replace: (s) => yollar.push(s), canGoBack: () => true, back() {} }, Link: 'Link', Redirect: 'Redirect', useLocalSearchParams: () => ({}), useFocusEffect: (f) => react.useEffect(f, [f]) },
    'expo-crypto': { randomUUID: () => '17000000-0000-4000-8000-000000000010' },
    'lib/supabase': { supabaseIstemcisiniAl: () => { throw new Error('Testte gerçek Supabase bağlantısı yok.'); } },
    'expo-router/react-navigation': { usePreventRemove() {} },
    '@react-native-community/datetimepicker': 'DateTimePicker',
    'hooks/useOturum': { useOturum: () => ({ oturum }) },
    'hooks/useGaleri': { useGaleri: () => ({ veri, hata: null, yukleniyor: false, yenile() {}, dahaFazla() {} }) },
    'services/authService': { girisYap: async () => {}, kayitOl: async () => ({ dogrulamaGerekli: true }), cikisYap: async () => {} },
    'services/photoService': { galeridenSec: async () => [{ uri: 'file:///test.jpg', width: 10, height: 10 }] },
    'services/galleryDetailService': { galeriDetayiniGetir: async () => ({ duygu: 'joy', ani: { id: 'ani-a', title: 'Bir anı', memory_date: '2026-10-01', description: 'Hikâye', sphere_id: 'kure-a', fotograflar: [{ yol: 'a', url: null }] } }) },
    'services/memoryService': { aniBilgileriniGuncelle: async () => { throw new Error('Testte yazma yok'); } },
    ...ozel,
  };
  function yukle(ad) {
    const temiz = ad.replace(/\\/g, '/').replace(/\.(tsx?|jsx?)$/, '');
    if (temiz in dis && dis[temiz] !== undefined) return dis[temiz];
    const dosya = [ad, `${ad}.tsx`, `${ad}.ts`].map((a) => path.resolve(a)).find((a) => fs.existsSync(a) && fs.statSync(a).isFile());
    if (!dosya) throw new Error(`Beklenmeyen bağımlılık: ${ad}`);
    if (moduller.has(dosya)) return moduller.get(dosya).exports;
    const modul = { exports: {} }; moduller.set(dosya, modul);
    const kod = ts.transpileModule(fs.readFileSync(dosya, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(kod, { module: modul, exports: modul.exports, AbortController, Date, Error, console, URL,
      process: { env: {} }, __DEV__: false, setTimeout, clearTimeout, ...globals,
      require: (id) => id.startsWith('.') ? yukle(path.relative(process.cwd(), path.resolve(path.dirname(dosya), id))) : (id in dis ? dis[id] : require(id)),
    }, { filename: dosya });
    return modul.exports;
  }
  function ac(node, kimlik) {
    if (node == null || typeof node === 'boolean') return null;
    if (Array.isArray(node)) return node.map((n, i) => ac(n, `${kimlik}:${n?.key ?? i}`));
    if (typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      mevcut = durumlar.get(kimlik) ?? []; durumlar.set(kimlik, mevcut); sira = 0;
      return ac(node.type(node.props), `${kimlik}/`);
    }
    return { type: node.type, props: node.props, children: ac(node.props?.children, `${kimlik}/`) };
  }
  return { yukle, yollar, veri, oturum,
    unmount() { for (const slots of durumlar.values()) for (const slot of slots) slot?.temizle?.(); durumlar.clear(); },
    mount(dosya, ad = 'default', p = {}) { kok = yukle(dosya)[ad]; props = p; return this.render(); },
    render() { const tree = ac({ type: kok, props }, 'kok'); while (etkiler.length) etkiler.shift()(); return tree; },
  };
}
function nodes(tree, kosul) {
  if (Array.isArray(tree)) return tree.flatMap((n) => nodes(n, kosul));
  if (!tree || typeof tree !== 'object') return [];
  return [...(kosul(tree) ? [tree] : []), ...nodes(tree.children, kosul)];
}
function metin(tree) {
  if (Array.isArray(tree)) return tree.map(metin).join(' ');
  if (tree == null) return '';
  return typeof tree === 'object' ? metin(tree.children) : String(tree);
}
module.exports = { uiOrtami, nodes, metin };
