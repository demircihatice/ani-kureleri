const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

function servis(yanit, status = 200) {
  const istekler = [];
  const istemci = createClient('https://test.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      istekler.push({ url: new URL(url), options });
      return new Response(JSON.stringify(yanit), { status, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const modul = { exports: {} };
  const kod = ts.transpileModule(fs.readFileSync('services/sphereService.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(kod, { module: modul, exports: modul.exports, Error,
    require: () => ({ supabaseIstemcisiniAl: () => istemci }) });
  return { ...modul.exports, istekler };
}

test('Gerçek SDK sorgusu sahipliği filtreler; count değerleri ve veritabanı adları kullanılır', async () => {
  const s = servis([{ id: 'set-a', name: 'Özel Set', spheres: [
    { id: 'n', name: 'Özel Nostalji', emotion_type: 'nostalji', memories: [{ count: 7 }] },
    { id: 'h', name: 'Hüzün', emotion_type: 'huzun', memories: [{ count: 0 }] },
    { id: 'm', name: 'Mutluluk', emotion_type: 'mutluluk', memories: [{ count: 12 }] },
  ] }]);
  const sonuc = await s.kureSetiniGetir('kullanici-a', new AbortController().signal);
  assert.equal(sonuc.name, 'Özel Set');
  assert.equal(sonuc.kureler[0].aniSayisi, 12);
  assert.equal(sonuc.kureler[1].aniSayisi, 0);
  assert.equal(sonuc.kureler[2].name, 'Özel Nostalji');
  const url = s.istekler[0].url;
  assert.equal(url.pathname, '/rest/v1/sphere_sets');
  assert.equal(url.searchParams.get('user_id'), 'eq.kullanici-a');
  assert.equal(url.searchParams.get('select'), 'id,name,spheres(id,name,emotion_type,memories(count))');
});

test('Set yoksa sahte küreler oluşturulmaz', async () => {
  const s = servis([]);
  assert.equal(await s.kureSetiniGetir('kullanici-a', new AbortController().signal), null);
});

test('Supabase hatası sıfır anılı başarılı sonuç olarak gösterilmez', async () => {
  const s = servis({ code: '42501', message: 'permission denied' }, 403);
  await assert.rejects(s.kureSetiniGetir('kullanici-a', new AbortController().signal), (hata) => hata.code === '42501');
});

test('Kimlik yoksa sorgu gönderilmez; iptal sinyali SDK isteğine aktarılır', async () => {
  const s = servis([]);
  await assert.rejects(s.kureSetiniGetir('', new AbortController().signal));
  assert.equal(s.istekler.length, 0);
  const kontrol = new AbortController();
  await s.kureSetiniGetir('kullanici-a', kontrol.signal);
  assert.equal(s.istekler[0].options.signal, kontrol.signal);
});
