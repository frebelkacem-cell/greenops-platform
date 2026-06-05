import { useState, useEffect, useRef, useCallback } from 'react';

// ── API helpers ───────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem('greenops_token');
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

async function apiLogin(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
  return res.json();
}

async function apiGetDevices() {
  const res = await fetch('/api/devices', { headers: authHeader() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiGetLive() {
  const res = await fetch('/api/metrics/live', { headers: authHeader() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiUpdate(device, updates) {
  const res = await fetch('/api/metrics/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ device, updates }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
  return res.json();
}

async function apiAddDevice(name, type, metrics) {
  const res = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ name, type, metrics }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
  return res.json();
}

async function apiDeleteDevice(name) {
  const res = await fetch(`/api/devices/${encodeURIComponent(name)}`, {
    method: 'DELETE', headers: authHeader(),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
  return res.json();
}

// ── Couleurs par type ─────────────────────────────────────────────────────────
const TYPE_COLORS = {
  firewall: '#00f5ff', switch: '#00ff88', vm: '#bf00ff',
  server: '#3b82f6',  router: '#f59e0b', storage: '#84cc16',
  default: '#00d4aa',
};
const TYPE_LABELS = {
  firewall: 'PARE-FEU', switch: 'SWITCH', vm: 'MACHINE VIRTUELLE',
  server: 'SERVEUR', router: 'ROUTEUR', storage: 'STOCKAGE', default: 'ÉQUIPEMENT',
};
function deviceColor(type) { return TYPE_COLORS[type] || TYPE_COLORS.default; }
function deviceLabel(type) { return TYPE_LABELS[type] || TYPE_LABELS.default; }

// ── Styles communs ────────────────────────────────────────────────────────────
const S = {
  panel: (color) => ({
    background: '#0d0d14',
    border: `1px solid ${color}30`,
    boxShadow: `0 4px 24px rgba(0,0,0,0.5), inset 0 0 30px ${color}04`,
    position: 'relative',
    padding: '18px',
    transition: 'border-color 0.4s',
  }),
  label: { color: 'rgba(0,245,255,0.4)', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '5px' },
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [u, setU] = useState('admin'), [p, setP] = useState('admin');
  const [err, setErr] = useState(''), [load, setLoad] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(''); setLoad(true);
    try { const d = await apiLogin(u, p); localStorage.setItem('greenops_token', d.token); onLogin(d); }
    catch (e) { setErr(e.message); } finally { setLoad(false); }
  }
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d0d14', border: '1px solid rgba(0,245,255,0.3)', padding: '2rem', width: '360px', boxShadow: '0 0 60px rgba(0,245,255,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ color: '#00f5ff', textShadow: '0 0 10px #00f5ff60', fontFamily: 'Courier New', fontSize: '22px', fontWeight: 'bold', letterSpacing: '0.3em', marginBottom: '4px' }}>GREENOPS</div>
          <div style={{ color: 'rgba(0,245,255,0.35)', fontSize: '10px', letterSpacing: '0.4em' }}>TOUR DE CONTRÔLE ADMIN</div>
        </div>
        <form onSubmit={submit}>
          {[['IDENTIFIANT', 'text', u, setU], ['MOT DE PASSE', 'password', p, setP]].map(([label, type, val, set], i) => (
            <div key={i} style={{ marginBottom: '14px' }}>
              <div style={S.label}>{label}</div>
              <input type={type} value={val} onChange={e => set(e.target.value)}
                style={{ width: '100%', background: '#060810', border: '1px solid rgba(0,245,255,0.2)', color: '#00f5ff', padding: '8px 12px', fontFamily: 'Courier New', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
          {err && <div style={{ color: '#ff2244', fontSize: '11px', marginBottom: '12px', textAlign: 'center' }}>⚠ {err}</div>}
          <button type="submit" disabled={load}
            style={{ width: '100%', padding: '10px', background: 'transparent', border: '2px solid #00f5ff', color: '#00f5ff', textShadow: '0 0 8px #00f5ff60', fontFamily: 'Courier New', letterSpacing: '0.2em', cursor: 'pointer', fontSize: '12px' }}>
            {load ? 'AUTHENTIFICATION...' : '▶ CONNEXION SÉCURISÉE'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── SLIDER métrique ───────────────────────────────────────────────────────────
function MetricSlider({ label, value, min, max, step = 0.1, unit, color, onChange }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: 'rgba(0,245,255,0.4)', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ color, fontSize: '12px', fontFamily: 'Courier New', fontWeight: 'bold' }}>
          {typeof value === 'number' ? value.toFixed(step < 1 ? 1 : 0) : '—'}{unit}
        </span>
      </div>
      <div style={{ position: 'relative', height: '4px', background: '#1a1a2e', borderRadius: '2px', marginBottom: '4px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', boxShadow: `0 0 4px ${color}80`, transition: 'width 0.3s ease' }} />
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: color, cursor: 'pointer', height: '14px' }} />
    </div>
  );
}

// ── DEVICE CARD ───────────────────────────────────────────────────────────────
function DeviceCard({ device, liveMetrics, onDelete }) {
  const color = deviceColor(device.type);
  const [metrics, setMetrics] = useState({
    temperature: 20, cpu_load: 10, ram: 20, network_traffic: 0.5, fan_speed: 1000,
  });
  const [status, setStatus]     = useState(null);
  const [confirm, setConfirm]   = useState(false);
  const timerRef   = useRef(null);
  const activeRef  = useRef(false); // true pendant qu'on drag un slider

  // Sync depuis live (sauf si l'utilisateur est en train de modifier)
  useEffect(() => {
    if (!liveMetrics || activeRef.current) return;
    setMetrics(prev => ({
      temperature:     liveMetrics.temperature     ?? prev.temperature,
      cpu_load:        liveMetrics.cpu_load        ?? prev.cpu_load,
      ram:             liveMetrics.ram             ?? prev.ram,
      network_traffic: liveMetrics.network_traffic ?? prev.network_traffic,
      fan_speed:       liveMetrics.fan_speed       ?? prev.fan_speed,
    }));
  }, [liveMetrics]);

  function handleChange(field, value) {
    activeRef.current = true;
    setMetrics(prev => ({ ...prev, [field]: value }));
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setStatus('sending');
      try {
        await apiUpdate(device.name, { [field]: value });
        setStatus('ok');
      } catch (err) {
        setStatus('err');
        console.error(err.message);
      }
      setTimeout(() => { setStatus(null); activeRef.current = false; }, 1500);
    }, 400);
  }

  const isCrit = metrics.cpu_load > 90 || metrics.temperature > 45;

  return (
    <div style={{ ...S.panel(isCrit ? '#ff2244' : color), borderColor: `${isCrit ? '#ff2244' : color}40` }}>
      {isCrit && <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,34,68,0.03)', animation: 'blinkAlert 0.8s ease-in-out infinite', pointerEvents: 'none' }} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ color: 'rgba(0,245,255,0.4)', fontSize: '9px', letterSpacing: '0.2em', marginBottom: '2px' }}>
            {deviceLabel(device.type)}
          </div>
          <div style={{ color: isCrit ? '#ff2244' : color, textShadow: `0 0 10px ${color}60`, fontSize: '16px', fontWeight: 'bold', letterSpacing: '0.15em', fontFamily: 'Courier New' }}>
            {device.name.toUpperCase()}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isCrit ? '#ff2244' : '#00ff88', boxShadow: `0 0 6px ${isCrit ? '#ff2244' : '#00ff88'}`, animation: 'blinkAlert 1.5s ease-in-out infinite' }} />
          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              style={{ background: 'transparent', border: '1px solid rgba(255,34,68,0.3)', color: 'rgba(255,34,68,0.5)', padding: '2px 8px', fontFamily: 'Courier New', fontSize: '9px', cursor: 'pointer', letterSpacing: '0.1em' }}>
              ✕
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => onDelete(device.name)}
                style={{ background: 'rgba(255,34,68,0.15)', border: '1px solid #ff2244', color: '#ff2244', padding: '2px 8px', fontFamily: 'Courier New', fontSize: '9px', cursor: 'pointer' }}>
                SUPPR.
              </button>
              <button onClick={() => setConfirm(false)}
                style={{ background: 'transparent', border: '1px solid rgba(0,245,255,0.3)', color: 'rgba(0,245,255,0.5)', padding: '2px 8px', fontFamily: 'Courier New', fontSize: '9px', cursor: 'pointer' }}>
                NON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sliders */}
      <MetricSlider label="Température" value={metrics.temperature} min={0}   max={100} unit="°C"   color={metrics.temperature > 45 ? '#ff2244' : metrics.temperature > 30 ? '#ff8c00' : color} onChange={v => handleChange('temperature', v)} />
      <MetricSlider label="CPU"         value={metrics.cpu_load}    min={0}   max={100} unit="%"    color={metrics.cpu_load > 90 ? '#ff2244' : metrics.cpu_load > 75 ? '#ff8c00' : color}        onChange={v => handleChange('cpu_load', v)} />
      <MetricSlider label="RAM"         value={metrics.ram}         min={0}   max={100} unit="%"    color={metrics.ram > 90 ? '#ff2244' : metrics.ram > 75 ? '#ff8c00' : color}                  onChange={v => handleChange('ram', v)} />
      <MetricSlider label="Trafic réseau" value={metrics.network_traffic} min={0} max={100} unit=" Gbps" color={metrics.network_traffic > 85 ? '#ff2244' : color}                              onChange={v => handleChange('network_traffic', v)} />
      <MetricSlider label="Ventilateurs" value={metrics.fan_speed}  min={0}   max={5000} step={50} unit=" RPM" color={metrics.fan_speed === 0 ? '#ff2244' : color}                             onChange={v => handleChange('fan_speed', v)} />

      {/* Status */}
      {status && (
        <div style={{ marginTop: '8px', fontSize: '10px', fontFamily: 'Courier New', display: 'flex', alignItems: 'center', gap: '6px',
          color: status === 'ok' ? '#00ff88' : status === 'err' ? '#ff2244' : 'rgba(0,245,255,0.5)' }}>
          {status === 'sending' && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00f5ff', animation: 'blinkAlert 0.4s infinite' }} />}
          {status === 'sending' ? 'ENVOI...' : status === 'ok' ? '✓ SYNCHRONISÉ' : '✗ ERREUR'}
        </div>
      )}
      {isCrit && (
        <div style={{ marginTop: '8px', color: '#ff2244', fontSize: '10px', fontFamily: 'Courier New', border: '1px solid rgba(255,34,68,0.4)', padding: '5px 8px', textAlign: 'center', animation: 'blinkAlert 0.8s infinite' }}>
          ⚠ SEUIL CRITIQUE DÉPASSÉ
        </div>
      )}
    </div>
  );
}

// ── MODAL AJOUT DEVICE ────────────────────────────────────────────────────────
const DEVICE_TYPES = [
  { value: 'firewall', label: 'Pare-feu' },
  { value: 'switch',   label: 'Switch réseau' },
  { value: 'server',   label: 'Serveur physique' },
  { value: 'vm',       label: 'Machine virtuelle' },
  { value: 'router',   label: 'Routeur' },
  { value: 'storage',  label: 'Stockage / NAS' },
];

function AddDeviceModal({ onAdd, onClose }) {
  const [name, setName]   = useState('');
  const [type, setType]   = useState('server');
  const [err, setErr]     = useState('');
  const [load, setLoad]   = useState(false);
  const [metrics, setMetrics] = useState({ temperature: 20, cpu_load: 10, ram: 20, network_traffic: 0.5, fan_speed: 1000 });

  const color = deviceColor(type);

  function setM(field, val) { setMetrics(prev => ({ ...prev, [field]: val })); }

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (!name.trim()) { setErr('Nom requis.'); return; }
    setLoad(true);
    try {
      await apiAddDevice(name.trim(), type, metrics);
      onAdd();
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0d0d14', border: `1px solid ${color}40`, padding: '24px', width: '460px', maxHeight: '90vh', overflowY: 'auto', boxShadow: `0 0 60px ${color}15` }}>
        {/* Header modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ color, fontFamily: 'Courier New', fontWeight: 'bold', fontSize: '14px', letterSpacing: '0.2em' }}>
              + NOUVEL ÉQUIPEMENT
            </div>
            <div style={{ color: 'rgba(0,245,255,0.3)', fontSize: '10px', letterSpacing: '0.15em', marginTop: '2px' }}>
              Sera visible sur tous les dashboards
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,34,68,0.6)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        <form onSubmit={submit}>
          {/* Nom */}
          <div style={{ marginBottom: '14px' }}>
            <div style={S.label}>NOM DE L'ÉQUIPEMENT</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Firewall Nord-Paris"
              style={{ width: '100%', background: '#060810', border: `1px solid ${color}30`, color, padding: '8px 12px', fontFamily: 'Courier New', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Type */}
          <div style={{ marginBottom: '18px' }}>
            <div style={S.label}>TYPE</div>
            <select value={type} onChange={e => setType(e.target.value)}
              style={{ width: '100%', background: '#060810', border: `1px solid ${color}30`, color, padding: '8px 12px', fontFamily: 'Courier New', fontSize: '12px', outline: 'none', cursor: 'pointer' }}>
              {DEVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Métriques initiales */}
          <div style={{ borderTop: `1px solid ${color}15`, paddingTop: '14px', marginBottom: '16px' }}>
            <div style={{ color: 'rgba(0,245,255,0.4)', fontSize: '10px', letterSpacing: '0.2em', marginBottom: '12px' }}>
              MÉTRIQUES INITIALES
            </div>
            <MetricSlider label="Température" value={metrics.temperature}     min={0}   max={100}  unit="°C"    color={color} onChange={v => setM('temperature', v)} />
            <MetricSlider label="CPU"         value={metrics.cpu_load}        min={0}   max={100}  unit="%"     color={color} onChange={v => setM('cpu_load', v)} />
            <MetricSlider label="RAM"         value={metrics.ram}             min={0}   max={100}  unit="%"     color={color} onChange={v => setM('ram', v)} />
            <MetricSlider label="Trafic réseau" value={metrics.network_traffic} min={0} max={100}  unit=" Gbps" color={color} onChange={v => setM('network_traffic', v)} />
            <MetricSlider label="Ventilateurs" value={metrics.fan_speed}       min={0}  max={5000} step={50} unit=" RPM" color={color} onChange={v => setM('fan_speed', v)} />
          </div>

          {err && <div style={{ color: '#ff2244', fontSize: '11px', marginBottom: '12px', padding: '6px 10px', border: '1px solid rgba(255,34,68,0.3)', background: 'rgba(255,34,68,0.05)' }}>⚠ {err}</div>}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" disabled={load}
              style={{ flex: 1, padding: '10px', background: `${color}15`, border: `2px solid ${color}`, color, fontFamily: 'Courier New', letterSpacing: '0.15em', cursor: 'pointer', fontSize: '12px' }}>
              {load ? 'CRÉATION...' : '✓ CRÉER L\'ÉQUIPEMENT'}
            </button>
            <button type="button" onClick={onClose}
              style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,34,68,0.3)', color: 'rgba(255,34,68,0.5)', fontFamily: 'Courier New', fontSize: '11px', cursor: 'pointer' }}>
              ANNULER
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DASHBOARD ADMIN ───────────────────────────────────────────────────────────
function AdminDashboard({ user, onLogout }) {
  const [devices,    setDevices]    = useState([]);
  const [liveData,   setLiveData]   = useState({});
  const [showModal,  setShowModal]  = useState(false);
  const [time,       setTime]       = useState(new Date());
  const [error,      setError]      = useState(null);

  // Horloge
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Charger la liste des devices
  const loadDevices = useCallback(async () => {
    try {
      const d = await apiGetDevices();
      setDevices(d.devices || []);
    } catch (e) { console.error('loadDevices:', e.message); }
  }, []);

  // Polling live métriques toutes les 1.5s
  useEffect(() => {
    loadDevices();
    const pollLive = async () => {
      try {
        const d = await apiGetLive();
        setLiveData(d.devices || {});
        setError(null);
      } catch (e) { setError(e.message); }
    };
    pollLive();
    const liveId   = setInterval(pollLive,   1500);
    const deviceId = setInterval(loadDevices, 5000);
    return () => { clearInterval(liveId); clearInterval(deviceId); };
  }, [loadDevices]);

  async function handleDelete(name) {
    try {
      await apiDeleteDevice(name);
      await loadDevices();
    } catch (e) { alert(`Erreur suppression: ${e.message}`); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0c' }}>
      {/* Header */}
      <div style={{ background: '#0d0d14', borderBottom: '1px solid rgba(0,245,255,0.1)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#00f5ff', textShadow: '0 0 10px #00f5ff40', fontFamily: 'Courier New', fontWeight: 'bold', letterSpacing: '0.3em', fontSize: '15px' }}>GREENOPS</span>
          <span style={{ color: 'rgba(0,245,255,0.3)', fontSize: '11px', letterSpacing: '0.2em' }}>TOUR DE CONTRÔLE</span>
          <span style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)', color: 'rgba(0,245,255,0.6)', fontSize: '10px', padding: '2px 8px', fontFamily: 'Courier New' }}>
            {devices.length} DEVICE{devices.length !== 1 ? 'S' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {error && <span style={{ color: '#ff6b35', fontSize: '10px', fontFamily: 'Courier New' }}>⚠ {error}</span>}
          <span style={{ color: 'rgba(0,245,255,0.4)', fontFamily: 'Courier New', fontSize: '12px' }}>{time.toLocaleTimeString('fr-FR')}</span>
          <button onClick={() => setShowModal(true)}
            style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.4)', color: '#00f5ff', padding: '6px 14px', fontFamily: 'Courier New', fontSize: '11px', letterSpacing: '0.15em', cursor: 'pointer' }}>
            + AJOUTER ÉQUIPEMENT
          </button>
          <span style={{ color: 'rgba(0,255,136,0.6)', fontSize: '11px', fontFamily: 'Courier New' }}>{user.username} // {user.role?.toUpperCase()}</span>
          <button onClick={onLogout}
            style={{ background: 'transparent', border: '1px solid rgba(255,34,68,0.3)', color: 'rgba(255,34,68,0.6)', padding: '4px 12px', fontFamily: 'Courier New', fontSize: '10px', cursor: 'pointer' }}>
            DÉCO
          </button>
        </div>
      </div>

      {/* Grid des cards */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {devices.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', color: 'rgba(0,245,255,0.25)', fontFamily: 'Courier New', fontSize: '13px', letterSpacing: '0.2em' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>◻</div>
            AUCUN ÉQUIPEMENT — CLIQUER SUR "+ AJOUTER ÉQUIPEMENT"
          </div>
        ) : (
          devices.map(device => (
            <DeviceCard
              key={device.name}
              device={device}
              liveMetrics={liveData[device.name]}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 24px', borderTop: '1px solid rgba(0,245,255,0.06)', display: 'flex', justifyContent: 'space-between', color: 'rgba(0,245,255,0.2)', fontSize: '10px', fontFamily: 'Courier New', letterSpacing: '0.1em' }}>
        <span>GREENOPS DIGITAL TWIN v2.0.0</span>
        <span>SYNC: 1.5s — API: /api/*</span>
        <span>{devices.length} DEVICE{devices.length !== 1 ? 'S' : ''} EN LIGNE</span>
      </div>

      {/* Modal */}
      {showModal && (
        <AddDeviceModal
          onAdd={() => { loadDevices(); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const token = localStorage.getItem('greenops_token');
    if (token) {
      try {
        const p = JSON.parse(atob(token.split('.')[1]));
        if (p.exp * 1000 > Date.now()) setUser({ username: p.username, role: p.role });
        else localStorage.removeItem('greenops_token');
      } catch { localStorage.removeItem('greenops_token'); }
    }
  }, []);
  if (!user) return <Login onLogin={d => setUser({ username: d.username, role: d.role })} />;
  return <AdminDashboard user={user} onLogout={() => { localStorage.removeItem('greenops_token'); setUser(null); }} />;
}
