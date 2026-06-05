import { useState, useEffect, useCallback, useRef } from 'react';
import { loginApi, fetchLive, fetchHistory } from './api/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ── Couleurs dynamiques — s'adapte à n'importe quel device ───────────────────
const PALETTE = ['#10e888','#00d4aa','#3b82f6','#f59e0b','#bf00ff','#ef4444','#06b6d4','#84cc16','#f472b6','#a78bfa'];
const colorCache = {};
function getDeviceColor(name) {
  if (!colorCache[name]) {
    const keys = Object.keys(colorCache);
    colorCache[name] = PALETTE[keys.length % PALETTE.length];
  }
  return colorCache[name];
}
// Compat : COLORS est calculé dynamiquement à l'usage
const COLORS = new Proxy({}, { get: (_, name) => getDeviceColor(name) });

// ── Utilitaires ───────────────────────────────────────────────────────────────
function pueColor(pue) {
  if (!pue) return '#8892b0';
  if (pue < 1.3) return '#10e888';
  if (pue < 1.5) return '#00d4aa';
  if (pue < 1.7) return '#f5c518';
  if (pue < 2.0) return '#ff6b35';
  return '#ff2d55';
}
function pueLabel(pue) {
  if (!pue) return '—';
  if (pue < 1.3) return 'EXCELLENT';
  if (pue < 1.5) return 'BON';
  if (pue < 1.7) return 'MOYEN';
  if (pue < 2.0) return 'DÉGRADÉ';
  return 'CRITIQUE';
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('admin');
  const [err,  setErr]  = useState('');
  const [load, setLoad] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(''); setLoad(true);
    try {
      const data = await loginApi(user, pass);
      localStorage.setItem('greenops_token', data.token);
      onLogin(data);
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#060810', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#0b0e1a', border:'1px solid rgba(16,232,136,0.3)', padding:'2rem', width:'360px',
        boxShadow:'0 0 40px rgba(16,232,136,0.08)' }}>
        <h1 style={{ color:'#10e888', fontFamily:'Courier New', textAlign:'center', letterSpacing:'0.2em', marginBottom:'0.3rem' }}>
          GREENOPS
        </h1>
        <p style={{ color:'rgba(16,232,136,0.4)', textAlign:'center', fontSize:'11px', letterSpacing:'0.3em', marginBottom:'2rem' }}>
          SUPERVISION DASHBOARD
        </p>
        <form onSubmit={submit}>
          {['Identifiant', 'Mot de passe'].map((label, i) => (
            <div key={i} style={{ marginBottom:'1rem' }}>
              <div style={{ color:'rgba(16,232,136,0.5)', fontSize:'11px', letterSpacing:'0.15em', marginBottom:'6px' }}>{label.toUpperCase()}</div>
              <input type={i===1?'password':'text'} value={i===0?user:pass}
                onChange={e => i===0 ? setUser(e.target.value) : setPass(e.target.value)}
                style={{ width:'100%', background:'#060810', border:'1px solid rgba(16,232,136,0.25)',
                  color:'#10e888', padding:'8px 12px', fontFamily:'Courier New', fontSize:'14px', outline:'none',
                  boxSizing:'border-box' }} />
            </div>
          ))}
          {err && <div style={{ color:'#ff2d55', fontSize:'12px', marginBottom:'1rem', textAlign:'center' }}>{err}</div>}
          <button type="submit" disabled={load}
            style={{ width:'100%', padding:'10px', background:'transparent', border:'2px solid #10e888',
              color:'#10e888', fontFamily:'Courier New', letterSpacing:'0.2em', cursor:'pointer',
              fontSize:'13px', transition:'all 0.2s' }}>
            {load ? 'CONNEXION...' : '▶ CONNEXION'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── GAUGE PUE circulaire ──────────────────────────────────────────────────────
function PUEGauge({ pue }) {
  const color  = pueColor(pue);
  const label  = pueLabel(pue);
  const pct    = pue ? Math.min(1, Math.max(0, (pue - 1.0) / 1.5)) : 0;
  const R = 80, cx = 100, cy = 100;
  const startAngle = 220, arcDeg = 280;
  function polar(angle) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
  }
  function arc(start, end) {
    const s = polar(start), e = polar(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
  }
  const endAngle = startAngle + pct * arcDeg;

  return (
    <svg width="200" height="200" viewBox="0 0 200 200">
      <path d={arc(startAngle, startAngle + arcDeg)} fill="none" stroke="#0f1221" strokeWidth="12" strokeLinecap="butt" />
      {pue && <path d={arc(startAngle, endAngle)} fill="none" stroke={color} strokeWidth="12" strokeLinecap="butt"
        style={{ filter:`drop-shadow(0 0 6px ${color}80)`, transition:'all 0.6s ease' }} />}
      <text x="100" y="90" textAnchor="middle" fill="rgba(136,146,176,0.6)" fontSize="10" fontFamily="Courier New" letterSpacing="2">PUE GLOBAL</text>
      <text x="100" y="115" textAnchor="middle" fill={color} fontSize="26" fontWeight="bold" fontFamily="Courier New"
        style={{ filter:`drop-shadow(0 0 6px ${color}60)`, transition:'fill 0.5s' }}>
        {pue ? pue.toFixed(3) : '—.———'}
      </text>
      <text x="100" y="133" textAnchor="middle" fill={color} fontSize="10" fontFamily="Courier New" letterSpacing="3">
        {label}
      </text>
    </svg>
  );
}

// ── ALERTE LOG ────────────────────────────────────────────────────────────────
function AlertLog({ alerts }) {
  if (alerts.length === 0) return (
    <div style={{ color:'rgba(16,232,136,0.3)', fontSize:'12px', padding:'1rem', textAlign:'center', fontFamily:'Courier New' }}>
      ✓ Aucune alerte — tous les systèmes nominaux
    </div>
  );
  return (
    <div style={{ maxHeight:'160px', overflowY:'auto' }}>
      {alerts.map(a => (
        <div key={a.id} className="slide-in"
          style={{ display:'flex', alignItems:'center', gap:'10px', padding:'6px 12px',
            borderLeft:`3px solid ${a.level==='critical'?'#ff2d55':a.level==='warning'?'#ff6b35':'#10e888'}`,
            marginBottom:'4px', background:'rgba(0,0,0,0.2)', fontSize:'12px', fontFamily:'Courier New' }}>
          {a.level === 'critical' && <span className="blink" style={{ color:'#ff2d55' }}>⚠</span>}
          {a.level === 'warning'  && <span style={{ color:'#ff6b35' }}>△</span>}
          {a.level === 'ok'       && <span style={{ color:'#10e888' }}>✓</span>}
          <span style={{ color:'rgba(136,146,176,0.6)', minWidth:'70px' }}>{a.time}</span>
          <span style={{ color: a.level==='critical'?'#ff2d55':a.level==='warning'?'#ff6b35':'#10e888' }}>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── HISTORIQUE ────────────────────────────────────────────────────────────────
function HistoryView({ token }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory(100)
      .then(d => setRecords(d.records || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color:'#10e888', padding:'2rem', textAlign:'center', fontFamily:'Courier New' }}>Chargement...</div>;

  return (
    <div style={{ padding:'1.5rem' }}>
      <h2 style={{ color:'#10e888', fontFamily:'Courier New', letterSpacing:'0.2em', marginBottom:'1rem' }}>
        HISTORIQUE — {records.length} entrées
      </h2>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'Courier New', fontSize:'12px' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #1a2040' }}>
              {['Date/Heure','Device','Temp °C','CPU %','Trafic Gbps','Fans RPM','PUE'].map(h => (
                <th key={h} style={{ padding:'8px 12px', color:'rgba(16,232,136,0.6)', textAlign:'left', letterSpacing:'0.1em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} style={{ borderBottom:'1px solid #0f1221', transition:'background 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(16,232,136,0.04)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <td style={{ padding:'7px 12px', color:'rgba(136,146,176,0.6)' }}>
                  {new Date(r.recorded_at).toLocaleString('fr-FR')}
                </td>
                <td style={{ padding:'7px 12px', color: COLORS[r.device] || '#10e888' }}>{r.device}</td>
                <td style={{ padding:'7px 12px', color: parseFloat(r.temperature)>35?'#ff2d55':parseFloat(r.temperature)>30?'#ff6b35':'#e8eaf6' }}>
                  {parseFloat(r.temperature||0).toFixed(1)}
                </td>
                <td style={{ padding:'7px 12px', color: parseFloat(r.cpu_load)>90?'#ff2d55':parseFloat(r.cpu_load)>75?'#ff6b35':'#e8eaf6' }}>
                  {parseFloat(r.cpu_load||0).toFixed(0)}%
                </td>
                <td style={{ padding:'7px 12px', color:'#e8eaf6' }}>{parseFloat(r.network_traffic||0).toFixed(1)}</td>
                <td style={{ padding:'7px 12px', color: parseInt(r.fan_speed||0)===0?'#ff2d55':'#e8eaf6' }}>
                  {parseInt(r.fan_speed||0) === 0 ? '⚠ ARRÊTÉ' : r.fan_speed}
                </td>
                <td style={{ padding:'7px 12px', color: pueColor(parseFloat(r.global_pue)) }}>
                  {parseFloat(r.global_pue||0).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── DASHBOARD PRINCIPAL ───────────────────────────────────────────────────────
let alertIdCounter = 0;
const prevAlertState = {};

function checkAlerts(latest) {
  const newAlerts = [];
  if (!latest?.devices) return newAlerts;
  const time = new Date().toLocaleTimeString('fr-FR');
  Object.entries(latest.devices).forEach(([device, m]) => {
    if (m.fan_speed === 0) {
      const key = `${device}_fan`;
      if (!prevAlertState[key]) {
        newAlerts.push({ id: ++alertIdCounter, level:'critical', time, message:`Ventilateurs ARRÊTÉS sur ${device}` });
        prevAlertState[key] = true;
      }
    } else { delete prevAlertState[`${device}_fan`]; }

    [['temperature',35,30],['cpu_load',90,75]].forEach(([metric, crit, warn]) => {
      const val = m[metric]; if (val == null) return;
      const key = `${device}_${metric}`;
      const prev = prevAlertState[key] || 'ok';
      if (val >= crit && prev !== 'critical') {
        newAlerts.push({ id:++alertIdCounter, level:'critical', time, message:`${device} — ${metric} critique: ${val.toFixed(1)}` });
        prevAlertState[key] = 'critical';
      } else if (val >= warn && val < crit && prev === 'ok') {
        newAlerts.push({ id:++alertIdCounter, level:'warning', time, message:`${device} — ${metric} élevée: ${val.toFixed(1)}` });
        prevAlertState[key] = 'warning';
      } else if (val < warn && prev !== 'ok') {
        newAlerts.push({ id:++alertIdCounter, level:'ok', time, message:`${device} — ${metric} revenue à la normale` });
        prevAlertState[key] = 'ok';
      }
    });
  });
  return newAlerts;
}

function Dashboard({ user, onLogout }) {
  const [latest,   setLatest]   = useState(null);
  const [series,   setSeries]   = useState({});
  const [pueHist,  setPueHist]  = useState([]);
  const [alerts,   setAlerts]   = useState([]);
  const [view,     setView]     = useState('live');
  const [error,    setError]    = useState(null);
  const tickRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      const data = await fetchLive();
      const label = new Date().toLocaleTimeString('fr-FR');
      const tick  = ++tickRef.current;
      setLatest(data);
      setError(null);
      setSeries(prev => {
        const next = { ...prev };
        Object.entries(data.devices || {}).forEach(([device, m]) => {
          next[device] = [...(prev[device]||[]).slice(-59), { tick, label, ...m }];
        });
        return next;
      });
      setPueHist(prev => [...prev.slice(-59), { tick, label, pue: data.globalPUE }]);
      const newA = checkAlerts(data);
      if (newA.length) setAlerts(prev => [...newA, ...prev].slice(0, 30));
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { poll(); const id = setInterval(poll, 1500); return () => clearInterval(id); }, [poll]);

  // Fusionner les données pour le graphique
  const chartData = (() => {
    const devices = Object.keys(series);
    const maxLen  = Math.max(...devices.map(d => series[d].length));
    const result  = [];
    for (let i = 0; i < maxLen; i++) {
      const point = {};
      devices.forEach(device => {
        const arr = series[device];
        const entry = arr[arr.length - maxLen + i];
        if (entry) { point.label = entry.label; point[device] = entry.temperature; }
      });
      if (point.label) result.push(point);
    }
    return result;
  })();

  return (
    <div style={{ minHeight:'100vh', background:'#060810', padding:'0' }}>
      {/* Header */}
      <div style={{ background:'#0b0e1a', borderBottom:'1px solid #1a2040', padding:'12px 24px',
        display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
          <span style={{ color:'#10e888', fontFamily:'Courier New', fontWeight:'bold', letterSpacing:'0.2em' }}>GREENOPS</span>
          <span style={{ color:'rgba(136,146,176,0.4)', fontSize:'12px' }}>Supervision Platform</span>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          {['live','history'].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ background:'transparent', border:`1px solid ${view===v?'#10e888':'#1a2040'}`,
                color: view===v?'#10e888':'rgba(136,146,176,0.5)', padding:'5px 14px',
                fontFamily:'Courier New', fontSize:'11px', letterSpacing:'0.15em', cursor:'pointer',
                transition:'all 0.15s', textTransform:'uppercase' }}>
              {v === 'live' ? 'TEMPS RÉEL' : 'HISTORIQUE'}
            </button>
          ))}
          <div style={{ width:'1px', height:'20px', background:'#1a2040', margin:'0 4px' }} />
          <span style={{ color:'rgba(16,232,136,0.5)', fontSize:'11px', fontFamily:'Courier New' }}>{user.username}</span>
          <button onClick={onLogout}
            style={{ background:'transparent', border:'1px solid rgba(255,45,85,0.3)', color:'rgba(255,45,85,0.6)',
              padding:'5px 12px', fontFamily:'Courier New', fontSize:'11px', cursor:'pointer', letterSpacing:'0.1em' }}>
            DÉCO
          </button>
        </div>
      </div>

      {view === 'history' ? <HistoryView /> : (
        <div style={{ padding:'20px', display:'grid', gap:'16px' }}>
          {error && (
            <div style={{ background:'rgba(255,45,85,0.1)', border:'1px solid rgba(255,45,85,0.3)',
              color:'#ff2d55', padding:'10px 16px', fontFamily:'Courier New', fontSize:'12px' }}>
              ⚠ Erreur API: {error}
            </div>
          )}

          {/* Ligne 1 : PUE + stats devices */}
          <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:'16px' }}>
            {/* Gauge PUE */}
            <div className="panel" style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'16px' }}>
              <PUEGauge pue={latest?.globalPUE} />
              <div style={{ color:'rgba(136,146,176,0.4)', fontSize:'10px', fontFamily:'Courier New', marginTop:'4px' }}>
                Mise à jour: 1.5s
              </div>
            </div>

            {/* Cartes devices */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px' }}>
              {Object.keys(series).map(device => {
                const color = getDeviceColor(device);
                const m = latest?.devices?.[device];
                return (
                  <div key={device} className="panel" style={{ padding:'14px', borderLeftColor:color, borderLeftWidth:'3px' }}>
                    <div style={{ color, fontSize:'11px', fontFamily:'Courier New', letterSpacing:'0.1em', marginBottom:'8px' }}>
                      {device.toUpperCase()}
                    </div>
                    {[
                      ['TEMP',    m?.temperature,     '°C',   35, 30],
                      ['CPU',     m?.cpu_load,        '%',    90, 75],
                      ['TRAFIC',  m?.network_traffic, ' Gbps',85, 70],
                    ].map(([label, val, unit, crit, warn]) => (
                      <div key={label} style={{ marginBottom:'6px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                          <span style={{ color:'rgba(136,146,176,0.4)', fontSize:'10px', fontFamily:'Courier New' }}>{label}</span>
                          <span style={{ fontSize:'12px', fontFamily:'Courier New', fontWeight:'bold',
                            color: val>=crit?'#ff2d55':val>=warn?'#ff6b35':color }}>
                            {val != null ? `${parseFloat(val).toFixed(1)}${unit}` : '—'}
                          </span>
                        </div>
                        <div style={{ height:'3px', background:'#0f1221', borderRadius:'2px' }}>
                          <div style={{ height:'100%', width:`${Math.min(100,(val||0)/crit*100)}%`,
                            background: val>=crit?'#ff2d55':val>=warn?'#ff6b35':color,
                            borderRadius:'2px', transition:'width 0.7s ease',
                            boxShadow:`0 0 4px ${val>=crit?'#ff2d55':color}60` }} />
                        </div>
                      </div>
                    ))}
                    {m?.fan_speed === 0 && (
                      <div className="blink" style={{ color:'#ff2d55', fontSize:'10px', fontFamily:'Courier New', marginTop:'4px' }}>
                        ⚠ VENTILATEURS ARRÊTÉS
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ligne 2 : Graphique températures */}
          <div className="panel" style={{ padding:'16px' }}>
            <div style={{ color:'rgba(136,146,176,0.6)', fontSize:'11px', fontFamily:'Courier New',
              letterSpacing:'0.15em', marginBottom:'12px', display:'flex', gap:'20px', alignItems:'center' }}>
              <span>TEMPÉRATURES TEMPS RÉEL (°C)</span>
              {Object.keys(series).map(d => {
                const c = getDeviceColor(d);
                return (
                  <span key={d} style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <span style={{ display:'inline-block', width:'16px', height:'2px', background:c, boxShadow:`0 0 4px ${c}` }} />
                    <span style={{ color:c, fontSize:'10px' }}>{d}</span>
                  </span>
                );
              })}
            </div>
            <div style={{ height:'200px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top:4, right:8, bottom:0, left:-20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2040" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill:'#3d4d73', fontSize:9, fontFamily:'Courier New' }}
                    tickLine={false} axisLine={{ stroke:'#1a2040' }} interval={9} />
                  <YAxis tick={{ fill:'#3d4d73', fontSize:9 }} tickLine={false} axisLine={false} domain={[15,60]} />
                  <Tooltip contentStyle={{ background:'#0b0e1a', border:'1px solid #1a2040', fontFamily:'Courier New', fontSize:'11px' }} />
                  <ReferenceLine y={35} stroke="rgba(255,45,85,0.3)" strokeDasharray="4 3" />
                  <ReferenceLine y={30} stroke="rgba(255,107,53,0.25)" strokeDasharray="4 3" />
                  {Object.keys(series).map(device => {
                    const color = getDeviceColor(device);
                    return (
                      <Line key={device} type="monotone" dataKey={device} stroke={color} strokeWidth={1.5}
                        dot={false} isAnimationActive={false} connectNulls
                        style={{ filter:`drop-shadow(0 0 3px ${color}60)` }} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ligne 3 : Alertes */}
          <div className="panel" style={{ padding:'0' }}>
            <div style={{ padding:'10px 16px', borderBottom:'1px solid #1a2040',
              color:'rgba(136,146,176,0.6)', fontSize:'11px', fontFamily:'Courier New', letterSpacing:'0.15em',
              display:'flex', alignItems:'center', gap:'8px' }}>
              {alerts.some(a=>a.level==='critical') && (
                <span className="blink" style={{ color:'#ff2d55' }}>⚠</span>
              )}
              CONSOLE D'ALERTES — {alerts.length} événement(s)
            </div>
            <AlertLog alerts={alerts} />
          </div>
        </div>
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
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) setUser({ username: payload.username, role: payload.role });
        else localStorage.removeItem('greenops_token');
      } catch { localStorage.removeItem('greenops_token'); }
    }
  }, []);

  if (!user) return <LoginScreen onLogin={d => setUser({ username: d.username, role: d.role })} />;
  return <Dashboard user={user} onLogout={() => { localStorage.removeItem('greenops_token'); setUser(null); }} />;
}
