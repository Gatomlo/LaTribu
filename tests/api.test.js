// Socle : installation, connexion parent, profils enfants, session enfant persistante, révocation.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-'));
const app = require('../server');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api/`; });
test.after(() => server.close());

// Mini client avec jar de cookies.
const client = () => {
  let cookie = '';
  const jar = {};
  return async (p, method = 'GET', body) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); jar[kv.split('=')[0]] = kv; cookie = Object.values(jar).join('; '); } // session + appareil
    return { status: res.status, data: await res.json() };
  };
};

test('installation, parent, enfant, session persistante, révocation', async () => {
  const parent = client(), kid = client(), anon = client();
  assert.equal((await anon('session')).data.setup, true);
  assert.equal((await anon('setup', 'POST', { email: 'p@x.be', password: 'court' })).status, 400);
  assert.equal((await parent('setup', 'POST', { email: 'p@x.be', password: 'motdepasse1' })).status, 200);
  assert.equal((await anon('setup', 'POST', { email: 'q@x.be', password: 'motdepasse1' })).status, 409);
  assert.equal((await anon('kids')).status, 401);

  assert.equal((await parent('kids', 'POST', { name: 'Alex', pin: '12' })).status, 400);
  const created = await parent('kids', 'POST', { name: 'Alex', age: 9, palette: 1, pin: '1234' });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await anon('profiles')).data.length, 1);

  assert.equal((await kid(`kids/${id}/login`, 'POST', { pin: '0000' })).status, 401);
  assert.equal((await kid(`kids/${id}/login`, 'POST', { pin: '1234' })).status, 200);
  assert.equal((await kid('session')).data.role, 'kid');
  assert.equal((await kid('kids')).status, 403);

  assert.equal((await parent(`kids/${id}/revoke`, 'POST', {})).status, 200);
  assert.equal((await kid('session')).data.role, null);

  assert.equal((await parent(`kids/${id}`, 'DELETE')).status, 200);
  assert.equal((await anon('profiles')).data.length, 0);
});

test('verrouillage après 5 PIN faux', async () => {
  const parent = client(), kid = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const { data } = await parent('kids', 'POST', { name: 'Sam', pin: '4321' });
  for (let i = 0; i < 5; i++) await kid(`kids/${data.id}/login`, 'POST', { pin: '0000' });
  assert.equal((await kid(`kids/${data.id}/login`, 'POST', { pin: '4321' })).status, 429);
});
