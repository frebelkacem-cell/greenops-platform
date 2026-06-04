function computeGlobalPUE(devicesState) {
  const devices = Object.values(devicesState);
  if (devices.length === 0) return 1.0;
  const avgCpu  = devices.reduce((s, d) => s + (d.cpu_load    || 0), 0) / devices.length;
  const avgTemp = devices.reduce((s, d) => s + (d.temperature || 0), 0) / devices.length;
  const itLoad        = 0.5 + (avgCpu / 100) * 0.5;
  const coolingOverhead = 1 + ((avgTemp - 18) / 100);
  const pue = Math.max(1.0, coolingOverhead / itLoad);
  return parseFloat(pue.toFixed(4));
}

module.exports = { computeGlobalPUE };
