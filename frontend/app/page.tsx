'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/* ── neon palette ─────────────────────────────── */
const WARM    = '#fb923c';            // orange — max temps
const COOL    = '#818cf8';            // indigo — min temps
const NEON    = '#a855f7';            // purple accent
const NEON_BR = '#c084fc';            // lighter purple
const BORDER  = 'rgba(168,85,247,0.15)';
const MUTED   = '#8b8696';
const SURFACE = 'rgba(18,18,24,0.75)';

const COLUMNS = [
  { key: 'temperature_2m_max', label: 'Max' },
  { key: 'temperature_2m_min', label: 'Min' },
  { key: 'apparent_temperature_max', label: 'Feels max' },
  { key: 'apparent_temperature_min', label: 'Feels min' },
];

const today = new Date().toISOString().slice(0, 10);

export default function Home() {
  const [form, setForm] = useState({
    latitude: '23.0225',
    longitude: '72.5714',
    start_date: '2024-07-01',
    end_date: '2024-07-15',
  });

  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const [placeLabel, setPlaceLabel] = useState('Ahmedabad, Gujarat, India');

  const [storing, setStoring] = useState(false);
  const [storeError, setStoreError] = useState(null);
  const [storedName, setStoredName] = useState(null);

  const [files, setFiles] = useState([]);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { loadFiles(); }, []);

  // Debounced so a five-letter city name costs one request, not five.
  useEffect(() => {
    if (query.trim().length < 2) { setPlaces([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`${API}/geocode?q=${encodeURIComponent(query)}`);
        const body = await r.json();
        setPlaces(body.results || []);
      } catch { setPlaces([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const update = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  function choosePlace(place) {
    setForm((p) => ({
      ...p,
      latitude: place.latitude.toFixed(4),
      longitude: place.longitude.toFixed(4),
    }));
    setPlaceLabel([place.name, place.admin, place.country].filter(Boolean).join(', '));
    setQuery('');
    setPlaces([]);
  }

  async function storeData() {
    setStoring(true); setStoreError(null); setStoredName(null);
    try {
      const r = await fetch(`${API}/store-weather-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          start_date: form.start_date,
          end_date: form.end_date,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(readError(body));
      setStoredName(body.file);
      loadFiles();
      // Open what was just stored. Nobody wants to hunt for their own file in
      // a list one second after creating it; the list is for earlier fetches.
      openFile(body.file);
    } catch (err) { setStoreError(err.message); }
    finally { setStoring(false); }
  }

  async function loadFiles() {
    setListing(true); setListError(null);
    try {
      const r = await fetch(`${API}/list-weather-files`);
      if (!r.ok) throw new Error('Could not list stored files');
      setFiles((await r.json()).files);
    } catch (err) { setListError(err.message); }
    finally { setListing(false); }
  }

  async function openFile(name) {
    setSelected(name); setLoadingFile(true); setFileError(null);
    setContent(null); setPage(1);
    try {
      const r = await fetch(`${API}/weather-file-content/${encodeURIComponent(name)}`);
      const body = await r.json();
      if (!r.ok) throw new Error(readError(body));
      setContent(body);
    } catch (err) {
      setFileError(err.message);
    } finally {
      setLoadingFile(false);
      // On a narrow screen the results sit well below the fold after a fetch.
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setTimeout(() => {
          document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }

  // Open-Meteo returns parallel arrays. Flatten to one row per day, and carry a
  // [min, max] pair so the chart can draw the day's range as a band.
  const rows = useMemo(() => {
    if (!content?.daily?.time) return [];
    return content.daily.time.map((date, i) => {
      const row = { date };
      for (const c of COLUMNS) row[c.key] = content.daily[c.key]?.[i] ?? null;
      row.range = [row.temperature_2m_min, row.temperature_2m_max];
      return row;
    });
  }, [content]);

  // Shared scale so every row's range bar is comparable against the others.
  const domain = useMemo(() => {
    if (!rows.length) return [0, 1];
    const lows = rows.map((r) => r.temperature_2m_min).filter((v) => v != null);
    const highs = rows.map((r) => r.temperature_2m_max).filter((v) => v != null);
    if (!lows.length || !highs.length) return [0, 1];
    return [Math.min(...lows), Math.max(...highs)];
  }, [rows]);

  const unit = content?.daily_units?.temperature_2m_max ?? '°C';
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <main className="min-h-screen relative z-10">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-16">

        <header className="pb-8 mb-10" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="eyebrow mb-4">Open-Meteo archive · ERA5 reanalysis</div>
          <h1 className="display text-5xl sm:text-6xl leading-none">Weather Explorer</h1>
          <p className="mt-4 text-[15px] max-w-xl leading-relaxed" style={{ color: MUTED }}>
            Pull historical daily weather for any coordinate, keep the raw response
            in object storage, and read it back without touching the source again.
          </p>
        </header>

        {/* Input panel */}
        <section className="card p-6 sm:p-8 mb-6 glow-pulse">
          <div className="eyebrow mb-5">Fetch and store</div>

          <div className="relative mb-7">
            <label className="block text-sm font-medium mb-1.5" style={{ color: NEON_BR }}>Find a place</label>
            <input type="text" value={query} placeholder="Search a city — Ahmedabad, Nagpur, Jaipur"
              onChange={(e) => setQuery(e.target.value)} className="field" />
            <p className="text-xs mt-1.5" style={{ color: MUTED }}>
              {searching ? 'Searching…' : <>Coordinates set to <span className="mono" style={{ color: NEON_BR }}>{placeLabel}</span></>}
            </p>

            {places.length > 0 && (
              <ul className="absolute z-30 mt-1.5 w-full card overflow-hidden shadow-lg max-h-64 overflow-y-auto"
                style={{ boxShadow: '0 8px 32px rgba(168,85,247,0.2)' }}>
                {places.map((p, i) => (
                  <li key={i} style={{ borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
                    <button onClick={() => choosePlace(p)}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{ color: '#f0eef6' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(168,85,247,0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      {p.name}
                      <span className="ml-2 text-xs" style={{ color: MUTED }}>
                        {[p.admin, p.country].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Field label="Latitude" hint="−90 to 90">
              <input type="number" step="any" value={form.latitude}
                onChange={(e) => update('latitude', e.target.value)} className="field mono" />
            </Field>
            <Field label="Longitude" hint="−180 to 180">
              <input type="number" step="any" value={form.longitude}
                onChange={(e) => update('longitude', e.target.value)} className="field mono" />
            </Field>
            <Field label="Start date">
              <input type="date" max={today} value={form.start_date}
                onChange={(e) => update('start_date', e.target.value)} className="field mono" />
            </Field>
            <Field label="End date" hint="31 days maximum">
              <input type="date" max={today} value={form.end_date}
                onChange={(e) => update('end_date', e.target.value)} className="field mono" />
            </Field>
          </div>

          <div className="flex flex-wrap gap-3 mt-7">
            <button onClick={storeData} disabled={storing} className="btn-primary">
              {storing ? '⟳ Fetching…' : '⚡ Fetch and store'}
            </button>
            <button onClick={loadFiles} disabled={listing} className="btn-ghost">
              {listing ? 'Loading…' : '↻ Refresh file list'}
            </button>
          </div>

          {storedName && (
            <div className="mt-5 px-4 py-3 rounded-lg text-sm break-all"
              style={{
                background: 'rgba(168,85,247,0.08)',
                border: `1px solid rgba(168,85,247,0.25)`,
                color: NEON_BR,
              }}>
              ✓ Stored as <span className="mono text-xs">{storedName}</span>
            </div>
          )}
          {storeError && (
            <div className="mt-5 px-4 py-3 rounded-lg text-sm"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#f87171',
              }}>
              {storeError}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* File list */}
          <section className="lg:col-span-4 card overflow-hidden self-start order-2 lg:order-1">
            <div className="px-6 py-4 flex items-baseline justify-between"
              style={{ borderBottom: `1px solid ${BORDER}` }}>
              <span className="eyebrow">Stored files</span>
              <span className="mono text-xs" style={{ color: NEON }}>{files.length}</span>
            </div>

            {listError && <p className="px-6 py-5 text-sm" style={{ color: '#f87171' }}>{listError}</p>}
            {!listError && !files.length && !listing && (
              <p className="px-6 py-8 text-sm leading-relaxed" style={{ color: MUTED }}>
                Nothing stored yet. Fetch a date range above to create the first file.
              </p>
            )}

            <ul className="max-h-[460px] overflow-y-auto">
              {files.map((f, i) => (
                <li key={f.name} style={{ borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
                  <button onClick={() => openFile(f.name)}
                    className="w-full text-left px-6 py-3.5 transition-colors"
                    style={{
                      background: selected === f.name
                        ? 'rgba(168,85,247,0.12)'
                        : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (selected !== f.name) e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
                    }}
                    onMouseLeave={(e) => {
                      if (selected !== f.name) e.currentTarget.style.background = 'transparent';
                    }}>
                    <div className="mono text-[11px] leading-relaxed break-all"
                      style={{ color: selected === f.name ? NEON_BR : '#f0eef6' }}>
                      {f.name}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: MUTED }}>
                      {formatBytes(f.size)} · {formatDate(f.created_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Chart and table */}
          <section id="results" className="lg:col-span-8 space-y-6 order-1 lg:order-2">
            {!selected && !loadingFile && (
              <div className="card px-8 py-24 text-center text-sm" style={{ color: MUTED }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>☁️</div>
                Fetch a range above, or pick an earlier file, to read its daily temperatures.
              </div>
            )}

            {loadingFile && (
              <div className="card px-8 py-24 text-center text-sm" style={{ color: NEON_BR }}>
                <div className="inline-block animate-spin mb-3" style={{ fontSize: 24 }}>⟳</div>
                <div>Reading file…</div>
              </div>
            )}

            {fileError && (
              <div className="px-5 py-4 rounded-xl text-sm"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171',
                }}>
                {fileError}
              </div>
            )}

            {rows.length > 0 && !loadingFile && (
              <>
                <div className="card p-6 sm:p-8">
                  <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
                    <span className="eyebrow">Daily range</span>
                    <span className="mono text-[11px]" style={{ color: MUTED }}>
                      <span style={{ color: WARM }}>—</span> max
                      <span className="ml-3" style={{ color: COOL }}>—</span> min
                      <span className="ml-3">┈</span> feels like
                    </span>
                  </div>
                  <p className="text-sm mb-6" style={{ color: MUTED }}>
                    {rows.length} days at{' '}
                    <span className="mono" style={{ color: NEON_BR }}>
                      {content.latitude?.toFixed(3)}, {content.longitude?.toFixed(3)}
                    </span> · {unit}
                  </p>

                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={rows} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                      <defs>
                        <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={WARM} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={COOL} stopOpacity={0.2} />
                        </linearGradient>
                        <linearGradient id="neonGlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={NEON} stopOpacity={0.15} />
                          <stop offset="100%" stopColor={NEON} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(168,85,247,0.08)" vertical={false} />
                      <XAxis dataKey="date" minTickGap={28} tickLine={false}
                        axisLine={{ stroke: BORDER }}
                        tick={{ fontSize: 10, fill: MUTED, fontFamily: 'JetBrains Mono' }}
                        tickFormatter={(d) => d.slice(5)} />
                      <YAxis tickLine={false} axisLine={false} domain={['dataMin - 2', 'dataMax + 2']}
                        tick={{ fontSize: 10, fill: MUTED, fontFamily: 'JetBrains Mono' }} />
                      <Tooltip content={<RangeTooltip unit={unit} />} />
                      <Area dataKey="range" stroke="none" fill="url(#band)" isAnimationActive={false} />
                      <Line dataKey="temperature_2m_max" stroke={WARM} strokeWidth={2} dot={false} />
                      <Line dataKey="temperature_2m_min" stroke={COOL} strokeWidth={2} dot={false} />
                      <Line dataKey="apparent_temperature_max" stroke={WARM} strokeWidth={1}
                        strokeDasharray="2 3" dot={false} />
                      <Line dataKey="apparent_temperature_min" stroke={COOL} strokeWidth={1}
                        strokeDasharray="2 3" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="card overflow-hidden">
                  <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
                    style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <span className="eyebrow">Daily values</span>
                    <label className="text-xs flex items-center gap-2" style={{ color: MUTED }}>
                      Rows
                      <select value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                        className="mono text-xs px-2 py-1 rounded-md"
                        style={{
                          background: 'rgba(14,14,20,0.8)',
                          border: `1px solid ${BORDER}`,
                          color: '#f0eef6',
                        }}>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                    </label>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="eyebrow" style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <th className="text-left px-6 py-3 font-normal">Date</th>
                          {COLUMNS.map((c) => (
                            <th key={c.key} className="text-right px-4 py-3 font-normal whitespace-nowrap">
                              {c.label}
                            </th>
                          ))}
                          <th className="text-left px-6 py-3 font-normal w-32">Range</th>
                        </tr>
                      </thead>
                      <tbody className="mono text-[13px]">
                        {pageRows.map((row, i) => (
                          <tr key={row.date}
                            className="transition-colors"
                            style={{ borderTop: i ? `1px solid ${BORDER}` : 'none' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(168,85,247,0.04)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <td className="px-6 py-2.5 whitespace-nowrap">{row.date}</td>
                            {COLUMNS.map((c) => (
                              <td key={c.key} className="text-right px-4 py-2.5"
                                style={{ color: c.key.includes('max') ? WARM : COOL }}>
                                {row[c.key] ?? '—'}
                              </td>
                            ))}
                            <td className="px-6 py-2.5">
                              <RangeBar low={row.temperature_2m_min} high={row.temperature_2m_max}
                                domain={domain} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
                    style={{ borderTop: `1px solid ${BORDER}` }}>
                    <span className="mono text-xs" style={{ color: MUTED }}>
                      {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1} className="btn-ghost !px-4 !py-1.5 !text-xs">
                        ← Previous
                      </button>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages} className="btn-ghost !px-4 !py-1.5 !text-xs">
                        Next →
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        <p className="eyebrow mt-12 leading-relaxed" style={{ opacity: 0.6 }}>
          Daily aggregates from the Open-Meteo historical archive · Raw responses stored unmodified
        </p>
      </div>
    </main>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: '#c084fc' }}>{label}</label>
      {children}
      {hint && <p className="text-xs mt-1.5" style={{ color: '#8b8696' }}>{hint}</p>}
    </div>
  );
}

/** Each row's low-to-high span, drawn on the scale shared by the whole file. */
function RangeBar({ low, high, domain }) {
  if (low == null || high == null) return <span style={{ color: '#5a5468' }}>—</span>;
  const [floor, ceil] = domain;
  const span = ceil - floor || 1;
  const left = ((low - floor) / span) * 100;
  const width = Math.max(((high - low) / span) * 100, 2);
  return (
    <div className="relative h-1.5 w-full rounded-full" style={{ background: 'rgba(168,85,247,0.1)' }}>
      <div className="absolute h-1.5 rounded-full"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          background: 'linear-gradient(90deg, #818cf8, #a855f7, #fb923c)',
          boxShadow: '0 0 8px rgba(168,85,247,0.4)',
        }} />
    </div>
  );
}

function RangeTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="card px-3.5 py-2.5 text-xs shadow-lg"
      style={{
        background: 'rgba(18,18,24,0.95)',
        boxShadow: '0 4px 24px rgba(168,85,247,0.3)',
        border: '1px solid rgba(168,85,247,0.3)',
      }}>
      <div className="mono mb-1.5" style={{ color: '#c084fc' }}>{label}</div>
      <div className="mono" style={{ color: '#fb923c' }}>
        max {row.temperature_2m_max}{unit} · feels {row.apparent_temperature_max}{unit}
      </div>
      <div className="mono" style={{ color: '#818cf8' }}>
        min {row.temperature_2m_min}{unit} · feels {row.apparent_temperature_min}{unit}
      </div>
    </div>
  );
}

/** FastAPI returns validation problems under `detail`, in more than one shape. */
function readError(body) {
  const detail = body?.detail;
  if (!detail) return 'Request failed';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ');
  if (detail.message) return detail.message;
  return 'Request failed';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}