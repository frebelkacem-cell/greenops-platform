const express = require('express');
const { getRegisteredDevices, registerDevice, unregisterDevice } = require('./redis');
const { authenticate, requireRole } = require('./auth.middleware');

const router = express.Router();

// GET /api/devices — liste tous les devices
router.get('/', authenticate, async (req, res) => {
  try {
    const devices = await getRegisteredDevices();
    return res.json({ count: devices.length, devices });
  } catch (err) {
    console.error('[Devices] List error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/devices — ajouter un device (admin)
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { name, type, metrics } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '"name" requis.' });
  if (!type?.trim())  return res.status(400).json({ error: '"type" requis.' });

  try {
    const existing = await getRegisteredDevices();
    if (existing.some(d => d.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(409).json({ error: `Device "${name}" existe déjà.` });
    }

    const FIELDS = ['temperature', 'cpu_load', 'ram', 'network_traffic', 'fan_speed'];
    const sanitized = {};
    for (const f of FIELDS) {
      if (metrics?.[f] !== undefined) sanitized[f] = parseFloat(metrics[f]) || 0;
    }

    const device = await registerDevice(name.trim(), type.trim(), sanitized);
    return res.status(201).json({ message: `Device "${name}" créé.`, device });
  } catch (err) {
    console.error('[Devices] Create error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/devices/:name — supprimer un device (admin)
router.delete('/:name', authenticate, requireRole('admin'), async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const existing = await getRegisteredDevices();
    if (!existing.some(d => d.name === name)) {
      return res.status(404).json({ error: `Device "${name}" introuvable.` });
    }
    await unregisterDevice(name);
    return res.json({ message: `Device "${name}" supprimé.` });
  } catch (err) {
    console.error('[Devices] Delete error:', err.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
