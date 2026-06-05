const fetch = require('node-fetch');

const API_URL  = process.env.API_URL   || 'http://api-centrale:3000';
const INTERVAL = parseInt(process.env.SIM_INTERVAL_MS || '5000', 10);
const SIM_USER = process.env.SIM_USER  || 'admin';
const SIM_PASS = process.env.SIM_PASS  || 'admin';

// State par device — créé dynamiquement à la découverte
const state = {};
let token = null;

function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }
function drift(val, min, max, step) {
  return clamp(val + (Math.random() - 0.48) * step, min, max);
}

function initDeviceState(name) {
  if (state[name]) return;
  state[name] = {
    traffic: 0.5 + Math.random() * 2,
    cpu:     10  + Math.random() * 30,
    temp:    20  + Math.random() * 8,
    fans:    1000 + Math.floor(Math.random() * 500),
    ram:     20  + Math.random() * 40,
  };
  console.log(`[Sim] Nouveau device découvert: ${name}`);
}

function evolveDevice(name) {
  const s = state[name];
  s.traffic = drift(s.traffic, 0.1,  95.0, 3.0);
  s.cpu     = drift(s.cpu,     5.0,  98.0, 8.0);
  s.ram     = drift(s.ram,     5.0,  99.0, 3.0);
  s.temp    = clamp(20 + (s.cpu / 100) * 25 + (Math.random() - 0.5) * 2, 18, 65);
  s.fans    = s.temp > 40
    ? clamp(s.fans + 200, 800, 3000)
    : clamp(s.fans - 100, 800, 3000);
}

async function authenticate() {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: SIM_USER, password: SIM_PASS }),
    });
    if (!res.ok) { console.error(`[Sim] Auth failed: HTTP ${res.status}`); return false; }
    token = (await res.json()).token;
    console.log('[Sim] Authentifié.');
    return true;
  } catch (err) { console.error('[Sim] Auth error:', err.message); return false; }
}

async function fetchDevices() {
  try {
    const res = await fetch(`${API_URL}/api/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { token = null; return []; }
    if (!res.ok) return [];
    const data = await res.json();
    return (data.devices || []).map(d => d.name);
  } catch (err) { console.error('[Sim] fetchDevices error:', err.message); return []; }
}

async function pushMetrics(device) {
  const s = state[device];
  const updates = {
    temperature:     parseFloat(s.temp.toFixed(2)),
    network_traffic: parseFloat(s.traffic.toFixed(2)),
    cpu_load:        parseFloat(s.cpu.toFixed(2)),
    fan_speed:       Math.round(s.fans),
    ram:             parseFloat(s.ram.toFixed(2)),
  };

  try {
    const res = await fetch(`${API_URL}/api/metrics/update`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ device, updates }),
    });
    if (res.status === 401) { token = null; return; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[Sim] Update failed for ${device}: ${err.error || res.status}`);
      return;
    }
    const data = await res.json();
    console.log(`[Sim] ${device} → CPU: ${updates.cpu_load}% | Temp: ${updates.temperature}°C | PUE: ${data.globalPUE}`);
  } catch (err) { console.error(`[Sim] Push error for ${device}:`, err.message); }
}

async function tick() {
  if (!token) {
    const ok = await authenticate();
    if (!ok) return;
  }

  const devices = await fetchDevices();
  if (devices.length === 0) {
    console.log('[Sim] Aucun device enregistré, en attente...');
    return;
  }

  for (const name of devices) initDeviceState(name);
  for (const name of devices) evolveDevice(name);
  for (const name of devices) await pushMetrics(name);
}

async function main() {
  console.log(`[Sim] Démarrage — API: ${API_URL} | Intervalle: ${INTERVAL}ms`);
  await new Promise(r => setTimeout(r, 8000));
  await tick();
  setInterval(tick, INTERVAL);
}

main();
