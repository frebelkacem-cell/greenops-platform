const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const pueGauge = new client.Gauge({
  name: 'datacenter_global_pue',
  help: 'PUE global actuel du datacenter',
  registers: [register],
});

const tempGauge = new client.Gauge({
  name: 'greenops_device_temperature',
  help: 'Température par équipement (°C)',
  labelNames: ['device'],
  registers: [register],
});

const cpuGauge = new client.Gauge({
  name: 'greenops_device_cpu_load',
  help: 'Charge CPU par équipement (%)',
  labelNames: ['device'],
  registers: [register],
});

const networkGauge = new client.Gauge({
  name: 'greenops_device_network_traffic',
  help: 'Trafic réseau par équipement (Gbps)',
  labelNames: ['device'],
  registers: [register],
});

const fanGauge = new client.Gauge({
  name: 'greenops_device_fan_speed',
  help: 'Vitesse des ventilateurs par équipement (RPM)',
  labelNames: ['device'],
  registers: [register],
});

const ramGauge = new client.Gauge({
  name: 'greenops_device_ram',
  help: 'Utilisation RAM par équipement (%)',
  labelNames: ['device'],
  registers: [register],
});

function updatePUEGauge(value) {
  pueGauge.set(value);
}

function updateDeviceGauges(devicesState) {
  for (const [device, metrics] of Object.entries(devicesState)) {
    if (metrics.temperature     != null) tempGauge.set({ device }, metrics.temperature);
    if (metrics.cpu_load        != null) cpuGauge.set({ device }, metrics.cpu_load);
    if (metrics.network_traffic != null) networkGauge.set({ device }, metrics.network_traffic);
    if (metrics.fan_speed       != null) fanGauge.set({ device }, metrics.fan_speed);
    if (metrics.ram             != null) ramGauge.set({ device }, metrics.ram);
  }
}

module.exports = { register, updatePUEGauge, updateDeviceGauges };
