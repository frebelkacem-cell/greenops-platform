const { createClient } = require('redis');

const REGISTRY_KEY = 'greenops:devices';

const DEFAULT_DEVICES = [
  { name: 'F5 Firewall',  type: 'firewall', metrics: { temperature: 22.0, network_traffic: 1.2, cpu_load: 15.0, fan_speed: 1200, ram: 20 } },
  { name: 'Switch Cisco', type: 'switch',   metrics: { temperature: 21.5, network_traffic: 0.8, cpu_load: 10.0, fan_speed: 1000, ram: 15 } },
  { name: 'VM Linux',     type: 'vm',       metrics: { temperature: 23.0, network_traffic: 0.5, cpu_load: 20.0, fan_speed: 1100, ram: 34 } },
];

function redisKey(device) {
  return `device:${device.replace(/\s+/g, '_').toLowerCase()}`;
}

let redisClient;

async function getRedisClient() {
  if (redisClient) return redisClient;
  redisClient = createClient({
    socket: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT, 10) },
  });
  redisClient.on('error', err => console.error('[Redis] Erreur:', err));
  await redisClient.connect();
  console.log('[Redis] Connecté.');
  return redisClient;
}

// ── Registre des devices ──────────────────────────────────────────────────────

async function getRegisteredDevices() {
  const client = await getRedisClient();
  const raw = await client.hGetAll(REGISTRY_KEY);
  if (!raw || Object.keys(raw).length === 0) return [];
  return Object.values(raw).map(v => JSON.parse(v));
}

async function registerDevice(name, type, initialMetrics = {}) {
  const client = await getRedisClient();
  const deviceInfo = { name, type, addedAt: new Date().toISOString() };
  await client.hSet(REGISTRY_KEY, name, JSON.stringify(deviceInfo));

  const key = redisKey(name);
  const existing = await client.get(key);
  if (!existing) {
    const defaults = { temperature: 20, cpu_load: 10, network_traffic: 0.5, fan_speed: 1000, ram: 20 };
    await client.set(key, JSON.stringify({ ...defaults, ...initialMetrics }));
  }
  console.log(`[Redis] Device enregistré: ${name} (${type})`);
  return deviceInfo;
}

async function unregisterDevice(name) {
  const client = await getRedisClient();
  await client.hDel(REGISTRY_KEY, name);
  await client.del(redisKey(name));
  console.log(`[Redis] Device supprimé: ${name}`);
}

// ── État des métriques ────────────────────────────────────────────────────────

async function initRedis() {
  const client = await getRedisClient();

  // Seed les devices par défaut si le registre est vide
  const existing = await client.hGetAll(REGISTRY_KEY);
  if (!existing || Object.keys(existing).length === 0) {
    for (const device of DEFAULT_DEVICES) {
      await registerDevice(device.name, device.type, device.metrics);
    }
  }

  // Assurer que chaque device enregistré a bien un état
  const devices = await getRegisteredDevices();
  for (const device of devices) {
    const key = redisKey(device.name);
    const raw = await client.get(key);
    if (!raw) {
      await client.set(key, JSON.stringify({ temperature: 20, cpu_load: 10, network_traffic: 0.5, fan_speed: 1000, ram: 20 }));
    }
  }
}

async function getAllDevicesState() {
  const client = await getRedisClient();
  const devices = await getRegisteredDevices();
  const result = {};
  for (const device of devices) {
    const raw = await client.get(redisKey(device.name));
    result[device.name] = raw
      ? JSON.parse(raw)
      : { temperature: 20, cpu_load: 10, network_traffic: 0.5, fan_speed: 1000, ram: 20 };
  }
  return result;
}

async function updateDeviceState(device, updates) {
  const client = await getRedisClient();
  const key = redisKey(device);
  const raw = await client.get(key);
  const current = raw ? JSON.parse(raw) : {};
  const merged = { ...current, ...updates };
  await client.set(key, JSON.stringify(merged));
  return merged;
}

module.exports = {
  getRedisClient,
  initRedis,
  getAllDevicesState,
  updateDeviceState,
  getRegisteredDevices,
  registerDevice,
  unregisterDevice,
};
