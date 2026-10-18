const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uiOrtami, nodes, metin } = require('./ui-harness.cjs');
const id = '17000000-0000-4000-8000-000000000010';
const tick = () => new Promise((r) => setImmediate(r));
const button = (tree, ad) => nodes(tree, (n) => n.props?.accessibilityLabel === ad)[0];
const status = (s) => ({ memory_id: id, status: s, version: 2, predicted_emotion: null, final_emotion: null });
const emotion = (code) => ({ id: code, code, is_active: true });

test('Analiz ve feedback servisleri API client kullanır; istemci yalnızca düzeltme ve version gönderir', async () => {
  const calls = [];
  const h = uiOrtami({ 'services/apiClient': { ApiHatasi: Error, apiIstegi: async (path, options) => {
    calls.push({ path, options }); return path.endsWith('emotion-feedback') ? { analysis: status('completed'), changed: true } : status('queued');
  } } });
  // completed fixture gerçek inference değildir; yalnızca response sözleşmesi sınanır.
  const complete = status('completed'); complete.predicted_emotion = emotion('joy'); complete.final_emotion = emotion('sadness');
  Object.assign(complete, { predicted_confidence: 0.82, model_version: 'fixture', analyzed_at: '2026-10-17T00:00:00Z' });
  const mock = uiOrtami({ 'services/apiClient': { ApiHatasi: Error, apiIstegi: async (path, options) => { calls.push({ path, options }); return { analysis: complete, changed: true }; } } });
  await h.yukle('services/analysisService').analiziBaslat(id);
  await h.yukle('services/analysisService').kureyiSimuleEt(id);
  await mock.yukle('services/feedbackService').duyguGeriBildirimi(id, 'sadness', 2);
  assert.ok(calls[0].path.endsWith('/analysis/start')); assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.govde)), {});
  assert.ok(calls[1].path.endsWith('/simulate-trigger'));
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2].options.govde)), { corrected_emotion_code: 'sadness', expected_version: 2 });
});

test('Analiz yanıtı yanlış kimlik veya sahte completed bundle içerirse reddedilir', () => {
  const h = uiOrtami(), service = h.yukle('services/analysisService');
  for (const veri of [{ ...status('queued'), memory_id: 'foreign' }, status('completed'), status('unknown')]) {
    assert.throws(() => service.analizYanitiniDogrula(veri, id));
  }
});

test('Polling tek isteği bekler; cleanup timer temizler ve geç gelen yanıtı yoksayar', async () => {
  const timers = new Map(); let next = 0, calls = 0, finish, signal, updates = 0;
  const h = uiOrtami({}, { setTimeout: (fn) => { timers.set(++next, fn); return next; }, clearTimeout: (key) => timers.delete(key) });
  const stop = h.yukle('lib/analizIzleyici').analiziIzle({
    getir: (s) => { calls++; signal = s; return new Promise((r) => { finish = r; }); },
    degisti: () => updates++, hata: assert.fail, zamanDoldu: assert.fail,
  });
  assert.equal(calls, 1); assert.equal(timers.size, 0);
  finish(status('queued')); await tick(); assert.equal(timers.size, 1);
  const [key, timer] = [...timers][0]; timers.delete(key); timer(); assert.equal(calls, 2);
  stop(); assert.equal(signal.aborted, true); assert.equal(timers.size, 0);
  finish(status('completed')); await tick(); assert.equal(updates, 1);
});

test('Polling timeout ve terminal durumda durur; ikinci timer birikmez', async () => {
  let now = 0, timeout = 0, terminal = false;
  const timers = new Map(); let next = 0;
  const h = uiOrtami({}, { Date: { now: () => now }, setTimeout: (fn) => { timers.set(++next, fn); return next; }, clearTimeout: (key) => timers.delete(key) });
  const izle = h.yukle('lib/analizIzleyici').analiziIzle;
  let stop = izle({ getir: async () => status(terminal ? 'failed' : 'queued'), degisti() {}, hata: assert.fail, zamanDoldu: () => timeout++, sure: 100 });
  await tick(); assert.equal(timers.size, 1);
  now = 101; const [key, timer] = [...timers][0]; timers.delete(key); timer(); await tick();
  assert.equal(timeout, 1); assert.equal(timers.size, 0); stop();
  terminal = true; stop = izle({ getir: async () => status('completed'), degisti() {}, hata: assert.fail, zamanDoldu: assert.fail });
  await tick(); assert.equal(timers.size, 0); stop();
});

test('Analiz hook arka planda/unmount olduğunda isteği iptal eder, hesap değişince eski state göstermez', async () => {
  let change, snapshot, uid = 'user-a';
  const requests = [];
  const h = uiOrtami({
    'constants/api': { memoryApiEtkin: () => true },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_event, f) => { change = f; return { remove() {} }; } } },
    'services/analysisService': { analizDurumunuGetir: (_id, signal) => new Promise((resolve) => requests.push({ signal, resolve })) },
    'test-root': { default: () => { snapshot = h.yukle('hooks/useAnaliz').useAnaliz(uid, id); return null; } },
  });
  h.mount('test-root'); assert.equal(requests.length, 1);
  change('background'); assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve(status('completed')); await tick(); h.render(); assert.equal(snapshot.veri, null);
  change('active'); requests[1].resolve(status('failed')); await tick(); h.render(); assert.equal(snapshot.veri.status, 'failed');
  uid = 'user-b'; h.render(); assert.equal(snapshot.veri, null);
  h.unmount(); assert.equal(requests[2].signal.aborted, true);
});

test('Analiz ekranı tüm status metinlerini gösterir; yalnızca completed sonuç ekranına yönlenir', () => {
  const messages = { awaiting_nfc: 'Telefonunu Ana Küreye yaklaştır', queued: 'Analiz sırasına alındı', processing: 'Duygu algılanıyor...', completed: 'Duygu Belirlendi', failed: 'Analiz tamamlanamadı', cancelled: 'Analiz iptal edildi' };
  for (const [state, message] of Object.entries(messages)) {
    const h = uiOrtami({ 'hooks/useAnaliz': { useAnaliz: () => ({ veri: status(state), yenile() {} }) } });
    const tree = h.mount('src/app/analiz', 'AnalizIcerigi', { kullaniciId: 'user-a', id });
    assert.ok(metin(tree).includes(message)); assert.equal(h.yollar.length, state === 'completed' ? 1 : 0);
    if (state === 'queued') assert.match(metin(tree), /modeli henüz bağlı değil/);
  }
});

test('Production görünümünde simülasyon butonu görünmez', () => {
  const h = uiOrtami({ 'hooks/useAnaliz': { useAnaliz: () => ({ veri: status('awaiting_nfc'), yenile() {} }) } },
    { __DEV__: false, process: { env: { EXPO_PUBLIC_ANALYSIS_SIMULATION_ENABLED: 'true' } } });
  assert.equal(button(h.mount('src/app/analiz', 'AnalizIcerigi', { kullaniciId: 'user-a', id }), 'Ana Küreyi Simüle Et'), undefined);
});

test('API kapalıyken yeni kayıt servisi Storage veya HTTP işlemi yapmaz', async () => {
  const h = uiOrtami();
  await assert.rejects(h.yukle('services/newMemoryService').analizIcinAniOlustur({}, () => {}), /backend bağlantısı/);
});

function uploadOrtami({ postError, uploadError = false, responseId = id } = {}) {
  const calls = []; let fail = postError;
  class HttpError extends Error { constructor(message, durum, belirsiz) { super(message); this.durum = durum; this.belirsiz = belirsiz; } }
  const h = uiOrtami({
    'constants/api': { memoryApiEtkin: () => true },
    'lib/supabase': { supabaseIstemcisiniAl: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'user-a' } } } }) },
      storage: { from: () => ({ upload: async (path) => { calls.push(['upload', path]); return { error: uploadError }; }, remove: async (paths) => { calls.push(['remove', paths]); return {}; } }) } }) },
    'services/photoService': { fotografiHazirla: async () => new ArrayBuffer(4) },
    'services/apiClient': { ApiHatasi: HttpError, apiBaglantisiniDogrula() {}, apiIstegi: async (path, options) => { calls.push(['post', path, options.govde]); if (fail) throw new HttpError('network', fail.durum, fail.belirsiz); return { id: responseId, user_id: 'user-a', analysis_status: 'awaiting_nfc' }; } },
  });
  const deneme = { id, kullaniciId: 'user-a', form: { baslik: 'Başlık', aciklama: 'Metin', tarih: '2026-10-17', fotograflar: [{ uri: 'test' }] }, yollar: [`user-a/${id}/0.jpg`], yuklendi: false };
  return { service: h.yukle('services/newMemoryService'), calls, deneme, clearError: () => { fail = null; } };
}

test('Yeni kayıt fotoğrafı yükler ve yalnızca pending memory alanlarını POST eder', async () => {
  const s = uploadOrtami(); const ani = await s.service.analizIcinAniOlustur(s.deneme, () => {});
  assert.equal(ani.analysis_status, 'awaiting_nfc'); assert.equal(s.calls[0][0], 'upload');
  const body = JSON.parse(JSON.stringify(s.calls[1][2]));
  assert.deepEqual(Object.keys(body).sort(), ['description', 'id', 'memory_date', 'storage_paths', 'title']);
  assert.equal(body.id, id);
});

test('Belirsiz POST tekrarında aynı UUID/içerik kullanılır, dosya tekrar yüklenmez veya silinmez', async () => {
  const s = uploadOrtami({ postError: { durum: null, belirsiz: true } });
  await assert.rejects(s.service.analizIcinAniOlustur(s.deneme, () => {}), (e) => e.belirsiz);
  s.clearError(); await s.service.analizIcinAniOlustur(s.deneme, () => {});
  assert.equal(s.calls.filter((c) => c[0] === 'upload').length, 1); assert.equal(s.calls.filter((c) => c[0] === 'remove').length, 0);
  const posts = s.calls.filter((c) => c[0] === 'post'); assert.equal(posts.length, 2); assert.deepEqual(posts[0][2], posts[1][2]);
});

test('Yükleme hatası API kaydı oluşturmaz; kesin ret dosyaları temizler; bozuk başarı yanıtı belirsiz kalır', async () => {
  let s = uploadOrtami({ uploadError: true }); await assert.rejects(s.service.analizIcinAniOlustur(s.deneme, () => {}));
  assert.equal(s.calls.some((c) => c[0] === 'post'), false); assert.equal(s.calls.at(-1)[0], 'remove');
  s = uploadOrtami({ postError: { durum: 422, belirsiz: false } }); await assert.rejects(s.service.analizIcinAniOlustur(s.deneme, () => {})); assert.equal(s.calls.at(-1)[0], 'remove');
  s = uploadOrtami({ responseId: 'foreign' }); await assert.rejects(s.service.analizIcinAniOlustur(s.deneme, () => {}), (e) => e.belirsiz); assert.equal(s.calls.some((c) => c[0] === 'remove'), false);
});

test('Yeni anı ekranı başarılı API yanıtının kimliğiyle yönlenir ve çift kaydı kilitler', async () => {
  let complete, requests = 0, snapshot;
  const h = uiOrtami({
    'constants/api': { memoryApiEtkin: () => true },
    'services/newMemoryService': { YeniAniHatasi: Error, analizIcinAniOlustur: (attempt) => { requests++; snapshot = attempt; return new Promise((resolve) => { complete = resolve; }); } },
  });
  let tree = h.mount('src/app/yeni-ani');
  button(tree, 'Fotoğraf Ekle').props.onPress(); await tick(); tree = h.render();
  button(tree, 'Anı başlığı').props.onChangeText('Yaz'); tree = h.render();
  button(tree, 'Ana Küre ile Analiz Et').props.onPress(); button(tree, 'Ana Küre ile Analiz Et').props.onPress(); tree = h.render();
  assert.equal(requests, 1); assert.equal(button(tree, 'Anı başlığı').props.editable, false);
  assert.equal(snapshot.kullaniciId, 'user-a'); assert.equal(snapshot.form.baslik, 'Yaz'); assert.equal(snapshot.form.kureId, undefined);
  complete({ id, user_id: 'user-a', analysis_status: 'awaiting_nfc' }); await tick(); h.render();
  assert.equal(h.yollar.at(-1).pathname, '/analiz'); assert.equal(h.yollar.at(-1).params.memoryId, id);
});

test('Duygu düzenleme ekranı seçilen final duyguyu gerçek servise gönderir ve başarıyı bekler', async () => {
  let resolve, calls = [];
  const h = uiOrtami({ 'services/feedbackService': { duyguGeriBildirimi: (...args) => { calls.push(args); return new Promise((r) => { resolve = r; }); } } });
  let tree = h.mount('src/app/duygu-duzenle', 'DuzeltmeFormu', { id, version: 4, duygu: 'joy', yenile() {} });
  button(tree, 'Tiksinti').props.onPress(); tree = h.render();
  button(tree, 'Değişikliği Kaydet').props.onPress(); button(tree, 'Değişikliği Kaydet').props.onPress();
  assert.deepEqual(calls, [[id, 'disgust', 4]]); assert.equal(h.yollar.length, 0);
  resolve({ analysis: { ...status('completed'), final_emotion: emotion('disgust') }, changed: true }); await tick(); h.render();
  assert.equal(h.yollar.at(-1).pathname, '/analiz-sonucu');
});

test('Feedback bağlantı hatasında sahte başarı veya sonuç yönlendirmesi olmaz', async () => {
  const h = uiOrtami({ 'services/feedbackService': { duyguGeriBildirimi: async () => { throw new Error('offline'); } } });
  let tree = h.mount('src/app/duygu-duzenle', 'DuzeltmeFormu', { id, version: 1, duygu: 'joy', yenile() {} });
  button(tree, 'Değişikliği Kaydet').props.onPress(); await tick(); tree = h.render();
  assert.match(metin(tree), /Düzeltme sonucu doğrulanamadı/); assert.equal(h.yollar.length, 0);
});

test('Yeni API galerisi final emotion ile filtrelenir; yabancı Storage yolu imzalanmaz', async () => {
  const paths = [], urls = [];
  const own = `user-a/${id}/0.jpg`, other = `user-b/${id}/0.jpg`;
  const h = uiOrtami({
    'services/apiClient': { apiIstegi: async (url) => { urls.push(url); return { items: [
      { id, title: 'Yeni', memory_date: '2026-10-17', cover: { storage_path: own }, final_emotion: emotion('disgust') },
      { id: 'other', title: 'Yanlış path', memory_date: '2026-10-16', cover: { storage_path: other }, final_emotion: null },
    ], has_more: false }; }, ApiHatasi: Error },
    'lib/supabase': { supabaseIstemcisiniAl: () => ({ storage: { from: () => ({ createSignedUrls: async (p) => { paths.push(...p); return { data: p.map((path) => ({ path, signedUrl: 'signed-own', error: null })) }; } }) } }) },
  });
  const result = await h.yukle('services/apiMemoryService').apiGalerisiniGetir('user-a', 'disgust', 30, new AbortController().signal);
  assert.ok(urls[0].includes('page=2&page_size=30&emotion=disgust')); assert.deepEqual(paths, [own]);
  assert.equal(result.anilar[0].duygu, 'disgust'); assert.equal(result.anilar[1].kapak, null);
});
