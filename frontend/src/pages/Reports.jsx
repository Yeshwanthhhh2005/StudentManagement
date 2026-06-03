import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, downloadFile } from '../api/client.js';
import { StatCard, StatusBadge, Spinner, Progress, useToast, fmt, pct } from '../components/ui.jsx';

export default function Reports() {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [series, setSeries] = useState([]);
  const [segments, setSegments] = useState({ by: 'course', segments: [] });
  const [campaigns, setCampaigns] = useState([]);
  const [days, setDays] = useState(14);
  const [by, setBy] = useState('course');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [ov, ts, seg, rc] = await Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/timeseries', { params: { days } }),
      api.get('/analytics/segments', { params: { by } }),
      api.get('/analytics/recent-campaigns'),
    ]);
    setOverview(ov.data);
    setSeries(ts.data.series);
    setSegments(seg.data);
    setCampaigns(rc.data.items);
    setLoading(false);
  }, [days, by]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports &amp; Analytics</h1>
          <div className="sub">Campaign-wise performance, delivery trends, and segment insights.</div>
        </div>
      </div>

      <div className="grid grid-4 mb">
        <StatCard label="Total Recipients" value={fmt(overview.totalRecipients)} icon="◍" tone="violet" />
        <StatCard label="Delivery Rate" value={pct(overview.deliveryRate)} meta={`${fmt(overview.delivered)} delivered`} icon="✓" tone="green" />
        <StatCard label="Read Rate" value={pct(overview.readRate)} meta={`${fmt(overview.read)} read`} icon="👁" tone="blue" />
        <StatCard label="Failed" value={fmt(overview.failed)} meta="across all campaigns" icon="⚠" tone="red" />
      </div>

      <div className="card mb">
        <div className="card-head">
          <h3>Delivery Trends</h3>
          <select className="select" style={{ maxWidth: 160 }} value={days} onChange={(e) => setDays(+e.target.value)}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        <div className="card-pad" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} /><stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gDel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#25d366" stopOpacity={0.35} /><stop offset="100%" stopColor="#25d366" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Area type="monotone" dataKey="sent" stroke="#4f46e5" fill="url(#gSent)" strokeWidth={2} />
              <Area type="monotone" dataKey="delivered" stroke="#25d366" fill="url(#gDel)" strokeWidth={2} />
              <Area type="monotone" dataKey="read" stroke="#16a34a" fillOpacity={0} strokeWidth={2} />
              <Area type="monotone" dataKey="failed" stroke="#dc2626" fillOpacity={0} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-2 mb" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h3>Performance by Segment</h3>
            <select className="select" style={{ maxWidth: 140 }} value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="course">By course</option>
              <option value="city">By city</option>
              <option value="batch">By batch</option>
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{segments.by}</th><th>Recipients</th><th>Delivered</th><th style={{ minWidth: 130 }}>Delivery rate</th></tr></thead>
              <tbody>
                {segments.segments.length === 0 && (
                  <tr><td colSpan={4}><div className="empty"><div className="big">📊</div>No data yet — run a campaign.</div></td></tr>
                )}
                {segments.segments.map((s) => (
                  <tr key={s.key}>
                    <td className="t-strong">{s.key}</td>
                    <td>{fmt(s.recipients)}</td>
                    <td>{fmt(s.delivered)}</td>
                    <td>
                      <Progress value={s.deliveryRate * 100} />
                      <div className="t-muted" style={{ fontSize: 12, marginTop: 4 }}>{pct(s.deliveryRate)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Campaign Performance</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Campaign</th><th>Status</th><th>Sent</th><th>Delivery</th><th>Read</th><th></th></tr></thead>
              <tbody>
                {campaigns.length === 0 && (
                  <tr><td colSpan={6}><div className="empty"><div className="big">✉️</div>No campaigns yet.</div></td></tr>
                )}
                {campaigns.map((c) => (
                  <tr key={c._id}>
                    <td className="t-strong"><Link to={`/campaigns/${c._id}`}>{c.name}</Link></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{fmt(c.sentCount)}</td>
                    <td className="t-muted">{pct(c.sentCount ? c.deliveredCount / c.sentCount : 0)}</td>
                    <td className="t-muted">{pct(c.deliveredCount ? c.readCount / c.deliveredCount : 0)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => { downloadFile(`/analytics/campaigns/${c._id}/export`, `campaign-${c._id}.csv`); toast('Exporting…', '📤'); }}>
                        📤
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
