import { useEffect, useState, useCallback, useRef } from 'react';
import { api, downloadFile } from '../api/client.js';
import { StatusBadge, StatCard, Spinner, Modal, useToast, fmt } from '../components/ui.jsx';

const EMPTY = { name: '', phone: '', email: '', course: '', batch: '', city: '', status: 'active' };

export default function Students() {
  const toast = useToast();
  const fileRef = useRef();
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState({ search: '', course: '', batch: '', city: '', status: '' });
  const [filters, setFilters] = useState({ courses: [], batches: [], cities: [] });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(null); // null | {} new | student
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const params = { ...Object.fromEntries(Object.entries(q).filter(([, v]) => v)), page, limit: 25 };
    const { data } = await api.get('/students', { params });
    setData(data);
    setSelected(new Set());
    setLoading(false);
  }, [q, page]);

  const loadAux = useCallback(async () => {
    const [f, s] = await Promise.all([api.get('/students/filters'), api.get('/students/stats')]);
    setFilters(f.data);
    setStats(s.data);
  }, []);

  useEffect(() => { loadAux(); }, [loadAux]);
  useEffect(() => { load(); }, [load]);

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/students/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast(`Imported: ${fmt(data.upserted)} new, ${fmt(data.modified)} updated`, '📥');
      setPage(1);
      load();
      loadAux();
    } catch (err) {
      toast(err.response?.data?.error || 'Import failed', '⚠️');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveStudent = async () => {
    if (!editing.name || !editing.phone) return toast('Name and phone are required', '⚠️');
    try {
      if (editing._id) await api.put(`/students/${editing._id}`, editing);
      else await api.post('/students', editing);
      toast(editing._id ? 'Student updated' : 'Student added', '✅');
      setEditing(null);
      load();
      loadAux();
    } catch (err) {
      toast(err.response?.data?.error || 'Save failed', '⚠️');
    }
  };

  const del = async (id) => {
    await api.delete(`/students/${id}`);
    toast('Student deleted', '🗑️');
    load();
    loadAux();
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} selected students?`)) return;
    const { data } = await api.post('/students/bulk-delete', { ids: [...selected] });
    toast(`Deleted ${fmt(data.deleted)} students`, '🗑️');
    load();
    loadAux();
  };

  const exportCsv = () => {
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
    downloadFile(`/students/export?${params.toString()}`, 'students.csv');
    toast('Exporting filtered students…', '📤');
  };

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === data.items.length) setSelected(new Set());
    else setSelected(new Set(data.items.map((s) => s._id)));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Students</h1>
          <div className="sub">{fmt(data.total)} records · search, filter, segment, import &amp; export.</div>
        </div>
        <div className="flex gap">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={onImport} />
          <button className="btn" onClick={exportCsv}>📤 Export CSV</button>
          <button className="btn" disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? 'Importing…' : '📥 Import'}
          </button>
          <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>＋ Add student</button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-4 mb">
          <StatCard label="Total Students" value={fmt(stats.total)} icon="◍" tone="violet" />
          <StatCard label="Active" value={fmt(stats.active)} meta={`${fmt(stats.inactive)} inactive`} icon="✓" tone="green" />
          <StatCard label="Courses" value={fmt(stats.byCourse.length)} meta={stats.byCourse.slice(0, 2).map((c) => c.key).join(', ')} icon="❏" tone="blue" />
          <StatCard label="Cities" value={fmt(stats.byCity.length)} meta={stats.byCity.slice(0, 2).map((c) => c.key).join(', ')} icon="◈" tone="amber" />
        </div>
      )}

      <div className="toolbar">
        <input className="input grow" placeholder="Search name, phone, or email…"
          value={q.search} onChange={(e) => { setPage(1); setQ({ ...q, search: e.target.value }); }} />
        <select className="select" style={{ maxWidth: 150 }} value={q.course} onChange={(e) => { setPage(1); setQ({ ...q, course: e.target.value }); }}>
          <option value="">All courses</option>{filters.courses.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 130 }} value={q.batch} onChange={(e) => { setPage(1); setQ({ ...q, batch: e.target.value }); }}>
          <option value="">All batches</option>{filters.batches.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 150 }} value={q.city} onChange={(e) => { setPage(1); setQ({ ...q, city: e.target.value }); }}>
          <option value="">All cities</option>{filters.cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 130 }} value={q.status} onChange={(e) => { setPage(1); setQ({ ...q, status: e.target.value }); }}>
          <option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="toolbar">
          <span className="t-strong">{selected.size} selected</span>
          <button className="btn btn-danger btn-sm" onClick={bulkDelete}>🗑️ Delete selected</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="card">
        {loading ? <Spinner /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={data.items.length > 0 && selected.size === data.items.length} onChange={toggleAll} /></th>
                  <th>Name</th><th>Phone</th><th>Email</th><th>Course</th><th>Batch</th><th>City</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr><td colSpan={9}><div className="empty"><div className="big">◍</div>No students found. Import a CSV/Excel to get started.</div></td></tr>
                )}
                {data.items.map((s) => (
                  <tr key={s._id}>
                    <td><input type="checkbox" checked={selected.has(s._id)} onChange={() => toggle(s._id)} /></td>
                    <td className="t-strong">{s.name}</td>
                    <td className="mono">{s.phone}</td>
                    <td className="t-muted">{s.email || '—'}</td>
                    <td>{s.course || '—'}</td>
                    <td>{s.batch || '—'}</td>
                    <td>{s.city || '—'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>
                      <div className="flex gap">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => del(s._id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span>Page {page} of {data.pages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      </div>

      {editing && (
        <Modal title={editing._id ? 'Edit student' : 'Add student'} onClose={() => setEditing(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveStudent}>{editing._id ? 'Save changes' : 'Add'}</button>
          </>}>
          {['name', 'phone', 'email', 'course', 'batch', 'city'].map((f) => (
            <div className="field" key={f}>
              <label style={{ textTransform: 'capitalize' }}>{f}{['name', 'phone'].includes(f) ? ' *' : ''}</label>
              <input className="input" value={editing[f] || ''}
                placeholder={f === 'phone' ? '+919876543210' : ''}
                onChange={(e) => setEditing({ ...editing, [f]: e.target.value })} />
            </div>
          ))}
          <div className="field">
            <label>Status</label>
            <select className="select" value={editing.status || 'active'} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
        </Modal>
      )}
    </>
  );
}
