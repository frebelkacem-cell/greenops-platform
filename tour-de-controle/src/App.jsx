import { useState, useEffect, useRef } from 'react';

const getToken = () => localStorage.getItem('greenops_token');

async function apiLogin(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error||`HTTP ${res.status}`); }
  return res.json();
}

async function apiUpdate(device, updates) {
  const res = await fetch('/api/metrics/update', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
    body: JSON.stringify({ device, updates }),
  });
  if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error||`HTTP ${res.status}`); }
  return res.json();
}

async function apiLive() {
  const res = await fetch('/api/metrics/live', { headers: { Authorization:`Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Styles communs ────────────────────────────────────────────────────────────
const S = {
  panel: { background:'#0d0d14', border:'1px solid rgba(0,245,255,0.15)',
    boxShadow:'0 4px 24px rgba(0,0,0,0.5)', position:'relative', padding:'20px' },
  label: { color:'rgba(0,245,255,0.4)', fontSize:'10px', letterSpacing:'0.2em', textTransform:'uppercase', marginBottom:'6px' },
  neonText: (color='#00f5ff') => ({ color, textShadow:`0 0 10px ${color}60` }),
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [u,setU]=useState('admin'), [p,setP]=useState('admin'), [err,setErr]=useState(''), [load,setLoad]=useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(''); setLoad(true);
    try { const d=await apiLogin(u,p); localStorage.setItem('greenops_token',d.token); onLogin(d); }
    catch(e){ setErr(e.message); } finally{ setLoad(false); }
  }
  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0c', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ ...S.panel, width:'360px', border:'1px solid rgba(0,245,255,0.3)',
        boxShadow:'0 0 60px rgba(0,245,255,0.08)' }}>
        <div style={{ textAlign:'center', marginBottom:'28px' }}>
          <div style={{ ...S.neonText(), fontFamily:'Courier New', fontSize:'22px', fontWeight:'bold',
            letterSpacing:'0.3em', marginBottom:'4px' }}>GREENOPS</div>
          <div style={{ color:'rgba(0,245,255,0.35)', fontSize:'10px', letterSpacing:'0.4em' }}>TOUR DE CONTRÔLE ADMIN</div>
        </div>
        <form onSubmit={submit}>
          {[['IDENTIFIANT','text',u,setU],['MOT DE PASSE','password',p,setP]].map(([label,type,val,set],i)=>(
            <div key={i} style={{ marginBottom:'14px' }}>
              <div style={S.label}>{label}</div>
              <input type={type} value={val} onChange={e=>set(e.target.value)}
                style={{ width:'100%', background:'#060810', border:'1px solid rgba(0,245,255,0.2)',
                  color:'#00f5ff', padding:'8px 12px', fontFamily:'Courier New', outline:'none', boxSizing:'border-box' }} />
            </div>
          ))}
          {err && <div style={{ color:'#ff2244', fontSize:'11px', marginBottom:'12px', textAlign:'center' }}>⚠ {err}</div>}
          <button type="submit" disabled={load}
            style={{ width:'100%', padding:'10px', background:'transparent', border:'2px solid #00f5ff',
              ...S.neonText(), fontFamily:'Courier New', letterSpacing:'0.2em', cursor:'pointer', fontSize:'12px' }}>
            {load ? 'AUTHENTIFICATION...' : '▶ CONNEXION SÉCURISÉE'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── CARD F5 FIREWALL ──────────────────────────────────────────────────────────
function F5Card() {
  const [traffic, setTraffic] = useState(1.2);
  const [temp,    setTemp]    = useState(22.0);
  const [cpu,     setCpu]     = useState(15.0);
  const [status,  setStatus]  = useState(null);
  const sliderRef  = useRef(null);
  const timerRef   = useRef(null);
  const draggingRef = useRef(false);

  const isCrit = traffic > 80;

  // Sync depuis l'API toutes les 3s sauf si slider actif
  useEffect(() => {
    function sync() {
      if (draggingRef.current) return;
      apiLive().then(d => {
        const m = d.devices?.['F5 Firewall'];
        if (!m) return;
        const t = parseFloat(m.network_traffic) || 0;
        setTraffic(t);
        setTemp(parseFloat(m.temperature) || 22);
        setCpu(parseFloat(m.cpu_load) || 15);
        if (sliderRef.current) sliderRef.current.style.setProperty('--val', `${t}%`);
      }).catch(()=>{});
    }
    sync();
    const id = setInterval(sync, 1500);
    return () => clearInterval(id);
  }, []);

  function updateFill(val) {
    if (sliderRef.current) sliderRef.current.style.setProperty('--val', `${val}%`);
  }
  useEffect(() => updateFill(traffic), [traffic]);

  function handleChange(e) {
    const val = parseFloat(e.target.value);
    draggingRef.current = true;
    setTraffic(val); updateFill(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setStatus('sending');
      const newTemp = parseFloat((22 + (val / 100) * 28).toFixed(2));
      const newCpu  = parseFloat((15 + (val / 100) * 70).toFixed(2));
      try {
        await apiUpdate('F5 Firewall', {
          network_traffic: parseFloat(val.toFixed(2)),
          temperature:     newTemp,
          cpu_load:        newCpu,
        });
        setTemp(newTemp); setCpu(newCpu);
        setStatus('ok');
      } catch { setStatus('err'); }
      setTimeout(() => { setStatus(null); draggingRef.current = false; }, 2000);
    }, 500);
  }

  const color = isCrit ? '#ff2244' : traffic > 60 ? '#ff8c00' : '#00f5ff';

  return (
    <div style={{ ...S.panel, border:`1px solid ${color}40`, transition:'border-color 0.4s' }}>
      {isCrit && <div style={{ position:'absolute', inset:0, background:'rgba(255,34,68,0.04)',
        animation:'blinkAlert 0.6s ease-in-out infinite', pointerEvents:'none' }} />}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
        <div>
          <div style={S.label}>DEVICE_01</div>
          <div style={{ ...S.neonText(color), fontSize:'18px', fontWeight:'bold', letterSpacing:'0.15em' }}>F5 BIG-IP</div>
          <div style={{ color:`${color}60`, fontSize:'10px', letterSpacing:'0.2em' }}>PARE-FEU RÉSEAU</div>
        </div>
        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:isCrit?'#ff2244':'#00ff88',
          boxShadow:`0 0 8px ${isCrit?'#ff2244':'#00ff88'}`, marginTop:'4px',
          animation:'blinkAlert 1s ease-in-out infinite' }} />
      </div>

      {[['TEMPÉRATURE', temp.toFixed(1),    '°C',  temp/60],
        ['CHARGE CPU',  cpu.toFixed(0),     '%',   cpu/100],
        ['TRAFIC',      traffic.toFixed(1), ' Gbps', traffic/100]
       ].map(([label, val, unit, pct]) => (
        <div key={label} style={{ marginBottom:'10px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
            <span style={S.label}>{label}</span>
            <span style={{ color:color, fontSize:'12px', fontFamily:'Courier New', fontWeight:'bold' }}>{val}{unit}</span>
          </div>
          <div style={{ height:'3px', background:'#1a1a2e', borderRadius:'2px' }}>
            <div style={{ height:'100%', width:`${Math.min(100, pct*100)}%`, background:color,
              borderRadius:'2px', transition:'width 0.6s ease', boxShadow:`0 0 4px ${color}80` }} />
          </div>
        </div>
      ))}

      <div style={{ marginTop:'16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
          <span style={S.label}>TRAFIC RÉSEAU</span>
          <span style={{ ...S.neonText(color), fontSize:'14px', fontWeight:'bold', fontFamily:'Courier New' }}>
            {traffic.toFixed(1)} Gbps
          </span>
        </div>
        <input ref={sliderRef} type="range" min="0" max="100" step="0.1"
          value={traffic} onChange={handleChange} className="cyan-slider" />
        <div style={{ display:'flex', justifyContent:'space-between', color:'rgba(0,245,255,0.2)', fontSize:'9px', marginTop:'4px', fontFamily:'Courier New' }}>
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100 Gbps</span>
        </div>
      </div>

      {isCrit && <div className="blink-alert" style={{ color:'#ff2244', fontSize:'10px', fontFamily:'Courier New',
        border:'1px solid rgba(255,34,68,0.4)', padding:'6px', textAlign:'center', marginTop:'10px' }}>
        ⚠ SATURATION RÉSEAU — RISQUE SURCHAUFFE
      </div>}

      <StatusBadge status={status} />
    </div>
  );
}

// ── CARD CISCO SWITCH ─────────────────────────────────────────────────────────
function CiscoCard() {
  const [fans,   setFans]   = useState(true);
  const [temp,   setTemp]   = useState(21.5);
  const [cpu,    setCpu]    = useState(10);
  const [fanRpm, setFanRpm] = useState(1000);
  const [status, setStatus] = useState(null);
  const togglingRef = useRef(false);

  const color = fans ? '#00ff88' : '#ff2244';

  // Sync depuis l'API toutes les 3s
  useEffect(() => {
    function sync() {
      if (togglingRef.current) return;
      apiLive().then(d => {
        const m = d.devices?.['Switch Cisco'];
        if (!m) return;
        const rpm = parseFloat(m.fan_speed) || 0;
        setFans(rpm > 0);
        setTemp(parseFloat(m.temperature) || 21.5);
        setCpu(parseFloat(m.cpu_load) || 10);
        setFanRpm(Math.round(rpm));
      }).catch(()=>{});
    }
    sync();
    const id = setInterval(sync, 1500);
    return () => clearInterval(id);
  }, []);

  async function toggleFans() {
    const next = !fans;
    togglingRef.current = true;
    setFans(next); setStatus('sending');
    const newTemp = next ? 21.5 : 39.5;
    const newCpu  = next ? 10   : 25;
    const newRpm  = next ? 1000 : 0;
    try {
      await apiUpdate('Switch Cisco', { temperature: newTemp, fan_speed: newRpm, cpu_load: newCpu });
      setTemp(newTemp); setCpu(newCpu); setFanRpm(newRpm);
      setStatus('ok');
    } catch { setStatus('err'); setFans(!next); }
    setTimeout(() => { setStatus(null); togglingRef.current = false; }, 2000);
  }

  return (
    <div style={{ ...S.panel, border:`1px solid ${color}40`, transition:'border-color 0.4s' }}>
      {!fans && <div style={{ position:'absolute', inset:0, background:'rgba(255,34,68,0.04)',
        animation:'blinkAlert 0.6s ease-in-out infinite', pointerEvents:'none' }} />}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
        <div>
          <div style={S.label}>DEVICE_02</div>
          <div style={{ ...S.neonText(color), fontSize:'18px', fontWeight:'bold', letterSpacing:'0.15em' }}>CISCO CORE</div>
          <div style={{ color:`${color}60`, fontSize:'10px', letterSpacing:'0.2em' }}>SWITCH RÉSEAU CŒUR</div>
        </div>
        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:color,
          boxShadow:`0 0 8px ${color}`, animation:'blinkAlert 1s ease-in-out infinite' }} />
      </div>

      {[['TEMPÉRATURE', temp.toFixed(1),       '°C',  temp/60],
        ['CHARGE CPU',  cpu.toFixed(0),        '%',   cpu/100],
        ['FANS RPM',    fanRpm.toString(),      ' RPM', fanRpm/3000]
       ].map(([label, val, unit, pct]) => (
        <div key={label} style={{ marginBottom:'10px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
            <span style={S.label}>{label}</span>
            <span style={{ color:color, fontSize:'12px', fontFamily:'Courier New', fontWeight:'bold' }}>{val}{unit}</span>
          </div>
          <div style={{ height:'3px', background:'#1a1a2e', borderRadius:'2px' }}>
            <div style={{ height:'100%', width:`${pct*100}%`, background:color,
              borderRadius:'2px', transition:'width 0.6s ease' }} />
          </div>
        </div>
      ))}

      <div style={{ border:`1px solid ${color}25`, padding:'14px', marginTop:'12px',
        background:`${color}05` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ ...S.neonText(color), fontSize:'13px', fontFamily:'Courier New' }}>Ventilateurs de la Baie</div>
            <div style={{ color:`${color}50`, fontSize:'10px', letterSpacing:'0.1em', marginTop:'2px' }}>
              {fans ? 'REFROIDISSEMENT ACTIF' : 'SYSTÈME DÉSACTIVÉ'}
            </div>
          </div>
          <button onClick={toggleFans}
            style={{ width:'52px', height:'26px', background:fans?`${color}25`:`#ff224425`,
              border:`1px solid ${color}`, borderRadius:'2px', cursor:'pointer', position:'relative', transition:'all 0.3s' }}>
            <div style={{ position:'absolute', top:'3px', bottom:'3px', width:'18px', borderRadius:'1px',
              background:color, boxShadow:`0 0 6px ${color}`,
              left: fans ? 'calc(100% - 21px)' : '3px', transition:'left 0.3s' }} />
            <span style={{ ...S.neonText(color), fontSize:'8px', letterSpacing:'0.1em',
              position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              {fans?'ON':'OFF'}
            </span>
          </button>
        </div>
      </div>

      {!fans && <div className="blink-alert" style={{ color:'#ff2244', fontSize:'10px', fontFamily:'Courier New',
        border:'1px solid rgba(255,34,68,0.5)', padding:'8px', textAlign:'center', marginTop:'10px',
        background:'rgba(255,34,68,0.08)' }}>
        🔥 ALERTE — SURCHAUFFE IMMINENTE — TEMPÉRATURE CRITIQUE DANS ~120s
      </div>}

      <StatusBadge status={status} />
    </div>
  );
}

// ── CARD VM LINUX ─────────────────────────────────────────────────────────────
function VMCard() {
  const [cpu,      setCpu]      = useState(20);
  const [temp,     setTemp]     = useState(23.0);
  const [ram,      setRam]      = useState(34);
  const [stressed, setStressed] = useState(false);
  const [status,   setStatus]   = useState(null);
  const [countdown,setCountdown]= useState(null);
  const countRef    = useRef(null);
  const rampRef     = useRef(null);
  const stressedRef = useRef(false);

  const color = cpu > 90 ? '#ff2244' : '#bf00ff';

  // Sync depuis l'API toutes les 3s (pause pendant stress)
  useEffect(() => {
    function sync() {
      if (stressedRef.current) return;
      apiLive().then(d => {
        const m = d.devices?.['VM Linux'];
        if (!m) return;
        setCpu(parseFloat(m.cpu_load) || 20);
        setTemp(parseFloat(m.temperature) || 23);
      }).catch(()=>{});
    }
    sync();
    const id = setInterval(sync, 1500);
    return () => clearInterval(id);
  }, []);

  async function stressCpu() {
    if (stressed) return;
    stressedRef.current = true;
    let c = cpu;
    rampRef.current = setInterval(() => {
      c = Math.min(100, c + 10);
      setCpu(c);
      if (c >= 100) clearInterval(rampRef.current);
    }, 80);
    setStatus('sending');
    try {
      await apiUpdate('VM Linux', { cpu_load: 100, temperature: 48.0 });
      setStressed(true); setStatus('ok'); setCpu(100); setTemp(48.0);
      let t = 30; setCountdown(t);
      countRef.current = setInterval(() => {
        t--; setCountdown(t);
        if (t <= 0) {
          clearInterval(countRef.current);
          setStressed(false); stressedRef.current = false;
          setCountdown(null); setCpu(20); setTemp(23.0);
          apiUpdate('VM Linux', { cpu_load: 20, temperature: 23.0 }).catch(()=>{});
        }
      }, 1000);
    } catch { setStatus('err'); clearInterval(rampRef.current); setCpu(20); stressedRef.current = false; }
    setTimeout(() => setStatus(null), 3000);
  }

  useEffect(() => () => { clearInterval(countRef.current); clearInterval(rampRef.current); }, []);

  // Sparkline
  const [bars, setBars] = useState(Array(20).fill(0.1));
  useEffect(() => {
    const id = setInterval(() => {
      setBars(prev => [...prev.slice(1), stressed ? 0.7 + Math.random() * 0.3 : 0.1 + Math.random() * 0.2]);
    }, 200);
    return () => clearInterval(id);
  }, [stressed]);

  return (
    <div style={{ ...S.panel, border:`1px solid ${color}40`, transition:'border-color 0.4s' }}>
      {cpu > 90 && <div style={{ position:'absolute', inset:0, background:'rgba(255,34,68,0.04)',
        animation:'blinkAlert 0.6s ease-in-out infinite', pointerEvents:'none' }} />}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
        <div>
          <div style={S.label}>DEVICE_03</div>
          <div style={{ ...S.neonText(color), fontSize:'18px', fontWeight:'bold', letterSpacing:'0.15em' }}>VM LINUX</div>
          <div style={{ color:`${color}60`, fontSize:'10px', letterSpacing:'0.2em' }}>MACHINE VIRTUELLE</div>
        </div>
        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:color,
          boxShadow:`0 0 8px ${color}`, animation:'blinkAlert 1s ease-in-out infinite' }} />
      </div>

      {[['TEMPÉRATURE', temp.toFixed(1),              '°C', temp/60],
        ['CHARGE CPU',  cpu.toFixed(0),               '%',  cpu/100],
        ['MÉMOIRE RAM', stressed?'78':ram.toString(),  '%',  stressed?0.78:ram/100]
       ].map(([label, val, unit, pct]) => (
        <div key={label} style={{ marginBottom:'10px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
            <span style={S.label}>{label}</span>
            <span style={{ color:color, fontSize:'12px', fontFamily:'Courier New', fontWeight:'bold' }}>{val}{unit}</span>
          </div>
          <div style={{ height:'3px', background:'#1a1a2e', borderRadius:'2px' }}>
            <div style={{ height:'100%', width:`${Math.min(100,pct*100)}%`, background:color,
              borderRadius:'2px', transition:'width 0.6s ease' }} />
          </div>
        </div>
      ))}

      {/* Sparkline */}
      <div style={{ marginBottom:'12px' }}>
        <div style={S.label}>ACTIVITÉ CPU TEMPS RÉEL</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:'2px', height:'32px',
          background:'rgba(0,0,0,0.3)', padding:'2px 4px', border:'1px solid rgba(191,0,255,0.1)' }}>
          {bars.map((h,i) => (
            <div key={i} style={{ flex:1, borderRadius:'1px', transition:'height 0.15s',
              height:`${h*100}%`,
              background: stressed ? `rgba(255,${34+h*80},68,${0.4+h*0.5})` : `rgba(191,0,255,${0.3+h*0.5})` }} />
          ))}
        </div>
      </div>

      {/* Bouton stress */}
      <button onClick={stressCpu} disabled={stressed}
        style={{ width:'100%', padding:'12px', background:'transparent',
          border:`2px solid ${stressed?'#ff2244':'#bf00ff'}`,
          color: stressed?'#ff2244':'#bf00ff',
          textShadow:`0 0 8px ${stressed?'#ff2244':'#bf00ff'}`,
          fontFamily:'Courier New', letterSpacing:'0.12em', cursor: stressed?'not-allowed':'pointer',
          fontSize:'11px', transition:'all 0.2s',
          boxShadow: stressed ? '0 0 16px rgba(255,34,68,0.2)' : '0 0 8px rgba(191,0,255,0.15)' }}>
        {status === 'sending' ? '⚡ INJECTION EN COURS...' :
         stressed ? `⚡ STRESS ACTIF — RESET DANS ${countdown}s` :
         '💀 DÉCLENCHER STRESS CPU (BOUCLE INFINIE)'}
      </button>

      {stressed && (
        <div style={{ height:'3px', background:'rgba(255,34,68,0.2)', borderRadius:'2px', marginTop:'6px' }}>
          <div style={{ height:'100%', background:'#ff2244', borderRadius:'2px', transition:'width 1s linear',
            width:`${countdown!=null?(countdown/30)*100:0}%`, boxShadow:'0 0 4px rgba(255,34,68,0.6)' }} />
        </div>
      )}

      {cpu > 90 && <div className="blink-alert" style={{ color:'#ff2244', fontSize:'10px', fontFamily:'Courier New',
        border:'1px solid rgba(255,34,68,0.4)', padding:'6px', textAlign:'center', marginTop:'8px' }}>
        ⚠ CPU À 100% — RISQUE DE PANNE THERMIQUE
      </div>}

      <StatusBadge status={status} />
    </div>
  );
}

// ── STATUS BADGE ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (!status) return null;
  if (status === 'sending') return (
    <div style={{ color:'rgba(0,245,255,0.5)', fontSize:'10px', fontFamily:'Courier New',
      marginTop:'8px', display:'flex', alignItems:'center', gap:'6px' }}>
      <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#00f5ff', animation:'blinkAlert 0.5s infinite' }} />
      ENVOI EN COURS...
    </div>
  );
  return (
    <div className="fade-up" style={{ fontSize:'10px', fontFamily:'Courier New', marginTop:'8px',
      color: status==='ok' ? '#00ff88' : '#ff2244' }}>
      {status==='ok' ? '✓ SYNCHRONISÉ' : '✗ ERREUR DE SYNCHRONISATION'}
    </div>
  );
}

// ── DASHBOARD ADMIN ───────────────────────────────────────────────────────────
function AdminDashboard({ user, onLogout }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const id = setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(id); }, []);

  return (
    <div style={{ minHeight:'100vh', background:'#0a0a0c' }}>
      {/* Header */}
      <div style={{ background:'#0d0d14', borderBottom:'1px solid rgba(0,245,255,0.1)',
        padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <span style={{ ...S.neonText(), fontFamily:'Courier New', fontWeight:'bold', letterSpacing:'0.3em', fontSize:'15px' }}>
            GREENOPS
          </span>
          <span style={{ color:'rgba(0,245,255,0.3)', fontSize:'11px', letterSpacing:'0.2em' }}>
            TOUR DE CONTRÔLE
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
          <span style={{ color:'rgba(0,245,255,0.4)', fontFamily:'Courier New', fontSize:'12px' }}>
            {time.toLocaleTimeString('fr-FR')}
          </span>
          <span style={{ color:'rgba(0,255,136,0.6)', fontSize:'11px', fontFamily:'Courier New', letterSpacing:'0.1em' }}>
            {user.username} // {user.role?.toUpperCase()}
          </span>
          <button onClick={onLogout}
            style={{ background:'transparent', border:'1px solid rgba(255,34,68,0.3)',
              color:'rgba(255,34,68,0.6)', padding:'4px 12px', fontFamily:'Courier New',
              fontSize:'10px', cursor:'pointer', letterSpacing:'0.15em' }}>
            DÉCO
          </button>
        </div>
      </div>

      {/* Grid des 3 cartes */}
      <div style={{ padding:'20px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
        <F5Card />
        <CiscoCard />
        <VMCard />
      </div>

      {/* Footer */}
      <div style={{ padding:'12px 24px', borderTop:'1px solid rgba(0,245,255,0.06)',
        display:'flex', justifyContent:'space-between',
        color:'rgba(0,245,255,0.2)', fontSize:'10px', fontFamily:'Courier New', letterSpacing:'0.1em' }}>
        <span>GREENOPS DIGITAL TWIN v1.0.0</span>
        <span>API: /api/* → TRAEFIK → BACKEND:3000</span>
        <span>3 DEVICES EN LIGNE</span>
      </div>
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
  if (!user) return <Login onLogin={d => setUser({ username:d.username, role:d.role })} />;
  return <AdminDashboard user={user} onLogout={() => { localStorage.removeItem('greenops_token'); setUser(null); }} />;
}
