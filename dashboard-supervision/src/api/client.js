const getToken = () => localStorage.getItem('greenops_token');

function headers() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function loginApi(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error || `HTTP ${res.status}`); }
  return res.json();
}

export async function fetchLive() {
  const res = await fetch('/api/metrics/live', { headers: headers() });
  if (res.status === 401) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchHistory(limit = 200) {
  const res = await fetch(`/api/metrics/history?limit=${limit}`, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
