const { createClient } = require('redis');

const DEVICES = ['F5 Firewall', 'Switch Cisco', 'VM Linux'];

const DEFAULT_STATE = {
  'F5 Firewall':  { temperature: 22.0, network_traffic: 1.2, cpu_load: 15.0, fan_speed: 1200 },
  'Switch Cisco': { temperature: 21.5, network_traffic: 0.8, cpu_load: 10.0, fan_speed: 1000 },
  'VM Linux':     { temperature: 23.0, network_traffic: 0.5, cpu_load: 20.0, fan_speed: 1100 },
};

function redisKey(device) {
  return `device:${device.replace(/\s+/g, '_').toLowerCase()}`;
}

let redisClient;

async function getRedisClient() {
  if (redisClient) return redisClient;
  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT, 10),
    },
  });
  redisClient.on('error', err => console.error('[Redis] Erreur:', err));
  await redisClient.connect();
  console.log('[Redis] Connecté.');
  return redisClient;
}

async function initRedis() {
  const client = await getRedisClient();
  for (const device of DEVICES) {
    const key = redisKey(device);
    const existing = await client.get(key);
    if (!existing) {
      await client.set(key, JSON.stringify(DEFAULT_STATE[device]));
      console.log(`[Redis] Initialisé: ${device}`);
    }
  }
}

async function getAllDevicesState() {
  const client = await getRedisClient();
  const result = {};
  for (const device of DEVICES) {
    const raw = await client.get(redisKey(device));
    result[device] = raw ? JSON.parse(raw) : { ...DEFAULT_STATE[device] };
  }
  return result;
}

async function updateDeviceState(device, updates) {
  const client = await getRedisClient();
  const key = redisKey(device);
  const raw = await client.get(key);
  const current = raw ? JSON.parse(raw) : { ...DEFAULT_STATE[device] };
  const merged = { ...current, ...updates };
  await client.set(key, JSON.stringify(merged));
  return merged;
}

module.exports = { getRedisClient, initRedis, getAllDevicesState, updateDeviceState, DEVICES };
