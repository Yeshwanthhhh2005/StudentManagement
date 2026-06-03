import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { socket } from '../api/socket.js';
import { StatusBadge, Spinner, Progress, fmt, pct, dt } from '../components/ui.jsx';

export default function Campaigns() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await api.get('/campaigns', { params: { status: status || undefined, limit: 50 } });
    setItems(data.items);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    load();
    const onUpdate = () => load();
    socket.on('campaign:counters', onUpdate);
    socket.on('campaign:status', onUpdate);
    return () => {
      socket.off('campaign:counters', onUpdate);
      socket.off('campaign:status', onUpdate);
    };
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Campaigns</h1>
          <div className="sub">Create, schedule, and monitor WhatsApp campaigns.</div>
        </div>
        <Link to="/campaigns/new" className="btn btn-primary">＋ New Campaign</Link>
      </div>

      <div className="toolbar">
        <select className="select" style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['draft', 'scheduled', 'queued', 'sending', 'completed', 'cancelled'].map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th><th>Status</th><th>Recipients</th>
                  <th style={{ minWidth: 160 }}>Progress</th>
                  <th>Delivery</th><th>Read</th><th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={7}><div className="empty"><div className="big">✉️</div>No campaigns yet — create your first one.</div></td></tr>
                )}
                {items.map((c) => {
                  const done = c.sentCount + c.failedCount;
                  const progress = c.totalRecipients ? (done / c.totalRecipients) * 100 : 0;
                  return (
                    <tr key={c._id}>
                      <td className="t-strong"><Link to={`/campaigns/${c._id}`}>{c.name}</Link></td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>{fmt(c.totalRecipients)}</td>
                      <td>
                        <Progress value={progress} />
                        <div className="t-muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {fmt(done)} / {fmt(c.totalRecipients)}
                        </div>
                      </td>
                      <td className="t-muted">{pct(c.sentCount ? c.deliveredCount / c.sentCount : 0)}</td>
                      <td className="t-muted">{pct(c.deliveredCount ? c.readCount / c.deliveredCount : 0)}</td>
                      <td className="t-muted">{dt(c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
