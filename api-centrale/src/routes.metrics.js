const express = require('express');
const { pool } = require('./db');
const { getAllDevicesState, updateDeviceState, DEVICES } = require('./redis');
const { computeGlobalPUE } = require('./pue');
const { authenticate, requireRole } = require('./auth.middleware');
const { updatePUEGauge, updateDeviceGauges } = require('./prometheus');

const router = express.Router();

router.get('/live', authenticate, async (req, res) => {
  try {
    const devicesState = await getAllDevicesState();
    const globalPUE    = computeGlobalPUE(devicesState);
    updatePUEGauge(globalPUE);
    updateDeviceGauges(devicesState);
    return res.json({ timestamp: new Date().toISOString(), globalPUE, devices: devicesState });
  } catch (err) {
    console.error('[Metrics] Live error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/update', authenticate, requireRole('admin'), async (req, res) => {
  const { device, updates } = req.body;
  if (!device || !updates || typeof updates !== 'object') {
    return res.status(400).json({ error: '"device" et "updates" requis.' });
  }
  if (!DEVICES.includes(device)) {
    return res.status(400).json({ error: `Device inconnu. Valides: ${DEVICES.join(', ')}` });
  }

  const ALLOWED = ['temperature', 'network_traffic', 'cpu_load', 'fan_speed'];
  const sanitized = {};
  for (const field of ALLOWED) {
    if (updates[field] !== undefined) {
      const val = parseFloat(updates[field]);
      if (isNaN(val)) return res.status(400).json({ error: `"${field}" doit être un nombre.` });
      sanitized[field] = val;
    }
  }
  if (Object.keys(sanitized).length === 0) {
    return res.status(400).json({ error: `Champs valides: ${ALLOWED.join(', ')}` });
  }

  try {
    const newState    = await updateDeviceState(device, sanitized);
    const allDevices  = await getAllDevicesState();
    const globalPUE   = computeGlobalPUE(allDevices);
    updatePUEGauge(globalPUE);
    updateDeviceGauges(allDevices);

    await pool.query(
      `INSERT INTO metrics_history
        (device, temperature, network_traffic, cpu_load, fan_speed, global_pue)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [device, newState.temperature ?? null, newState.network_traffic ?? null,
       newState.cpu_load ?? null, newState.fan_speed ?? null, globalPUE]
    );

    return res.json({ message: `"${device}" mis à jour.`, device, newState, globalPUE });
  } catch (err) {
    console.error('[Metrics] Update error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.get('/history', authenticate, async (req, res) => {
  const { device, limit = 100, offset = 0 } = req.query;
  const parsedLimit  = Math.min(parseInt(limit,  10) || 100, 1000);
  const parsedOffset = parseInt(offset, 10) || 0;
  try {
    let result;
    if (device) {
      result = await pool.query(
        `SELECT * FROM metrics_history WHERE device=$1 ORDER BY recorded_at DESC LIMIT $2 OFFSET $3`,
        [device, parsedLimit, parsedOffset]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM metrics_history ORDER BY recorded_at DESC LIMIT $1 OFFSET $2`,
        [parsedLimit, parsedOffset]
      );
    }
    return res.json({ count: result.rowCount, records: result.rows });
  } catch (err) {
    console.error('[Metrics] History error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
