const fetch = require('node-fetch');

const API_URL   = process.env.API_URL   || 'http://api-centrale:3000';
const INTERVAL  = parseInt(process.env.SIM_INTERVAL_MS || '5000', 10);
const SIM_USER  = process.env.SIM_USER  || 'admin';
const SIM_PASS  = process.env.SIM_PASS  || 'admin';

const DEVICES = ['F5 Firewall', 'Switch Cisco', 'VM Linux'];

// Stateful simulation: each device has a "drift" that evolves over time
const state = {
  'F5 Firewall':  { traffic: 1.2,  temp: 22.0, cpu: 15.0, fans: 1200 },
  'Switch Cisco': { traffic: 0.8,  temp: 21.5, cpu: 10.0, fans: 1000 },
  'VM Linux':     { traffic: 0.5,  temp: 23.0, cpu: 20.0, fans: 1100 },
};

let token = null;

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function drift(val, min, max, step) {
  const delta = (Math.random() - 0.48) * step;
  return clamp(val + delta, min, max);
}

function evolveState() {
  for (const device of DEVICES) {
    const s = state[device];
    s.traffic = drift(s.traffic, 0.1,  95.0, 3.0);
    s.cpu     = drift(s.cpu,     5.0,  98.0, 8.0);
    s.temp    = clamp(22 + (s.cpu / 100) * 25 + (Math.random() - 0.5) * 2, 18, 65);
    s.fans    = s.temp > 40 ? clamp(s.fans + 200, 800, 3000) : clamp(s.fans - 100, 800, 3000);
  }
}

async function authenticate() {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: SIM_USER, password: SIM_PASS }),
    });
    if (!res.ok) {
      console.error(`[Sim] Auth failed: HTTP ${res.status}`);
      return false;
    }
    const data = await res.json();
    token = data.token;
    console.log('[Sim] Authenticated successfully.');
    return true;
  } catch (err) {
    console.error('[Sim] Auth error:', err.message);
    return false;
  }
}

async function pushMetrics(device) {
  const s = state[device];
  const updates = {
    temperature:     parseFloat(s.temp.toFixed(2)),
    network_traffic: parseFloat(s.traffic.toFixed(2)),
    cpu_load:        parseFloat(s.cpu.toFixed(2)),
    fan_speed:       Math.round(s.fans),
  };

  try {
    const res = await fetch(`${API_URL}/api/metrics/update`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ device, updates }),
    });

    if (res.status === 401) {
      console.warn('[Sim] Token expired, re-authenticating...');
      token = null;
      return;
    }

    if (!res.ok) {
      console.error(`[Sim] Update failed for ${device}: HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    console.log(`[Sim] ${device} → CPU: ${updates.cpu_load}% | Temp: ${updates.temperature}°C | PUE: ${data.globalPUE}`);
  } catch (err) {
    console.error(`[Sim] Push error for ${device}:`, err.message);
  }
}

async function tick() {
  if (!token) {
    const ok = await authenticate();
    if (!ok) {
      console.log('[Sim] Will retry authentication in next tick...');
      return;
    }
  }

  evolveState();

  for (const device of DEVICES) {
    await pushMetrics(device);
  }
}

async function main() {
  console.log(`[Sim] Starting — API: ${API_URL} | Interval: ${INTERVAL}ms`);

  // Initial delay to wait for api-centrale to be ready
  await new Promise(r => setTimeout(r, 8000));

  await tick();
  setInterval(tick, INTERVAL);
}

main();
