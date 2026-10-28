import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Filter, Eye, X } from 'lucide-react';
import api from '../../services/api';

export default function AuditLogsView() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [actionFilter, setActionFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDetailJson, setSelectedDetailJson] = useState(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      if (actionFilter) params.append('action', actionFilter);

      const res = await api.get(`/api/audit/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Fetch audit logs error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="audit-logs-container">
      {/* Top Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            className="form-input"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            style={{ width: '180px', fontSize: '0.8rem', padding: '6px 10px' }}
          >
            <option value="">All Actions</option>
            <option value="USER_LOGIN">USER_LOGIN</option>
            <option value="USER_CREATE">USER_CREATE</option>
            <option value="ROLE_UPDATE">ROLE_UPDATE</option>
            <option value="NVR_CREATE">NVR_CREATE</option>
            <option value="AGENT_CREATE">AGENT_CREATE</option>
            <option value="PTZ_CONTROL">PTZ_CONTROL</option>
          </select>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={fetchLogs}
            title="Refresh Logs"
            style={{ padding: '6px 10px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin-icon' : ''} />
          </button>
        </div>

        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
          Total Logged Events: <strong>{total}</strong>
        </span>
      </div>

      {/* Logs Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Resource</th>
              <th>IP Address</th>
              <th style={{ width: '60px', textAlign: 'center' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b', fontSize: '0.86rem', fontWeight: 500 }}>
                  No data found
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="font-mono" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    #{log.id}
                  </td>
                  <td style={{ fontSize: '0.76rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: log.action.includes('LOGIN') ? '#ecfdf5' : log.action.includes('DELETE') ? '#fef2f2' : '#eff6ff',
                      color: log.action.includes('LOGIN') ? '#065f46' : log.action.includes('DELETE') ? '#991b1b' : '#1e40af'
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, fontSize: '0.8rem', color: '#0f172a' }}>
                    {log.username || 'System'}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: '#475569' }}>
                    {log.resource_type ? `${log.resource_type} #${log.resource_id || ''}` : '-'}
                  </td>
                  <td className="font-mono" style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    {log.ip_address || '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {log.details ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedDetailJson(log.details)}
                        style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                        title="View Event Details"
                      >
                        <Eye size={12} />
                      </button>
                    ) : (
                      <span style={{ color: '#cbd5e1' }}>-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {total > 0 && (
        <div className="camera-grid-pagination" style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="pagination-info-text">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} events
            </span>
            <select
              className="pagination-select"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={15}>15 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <div className="pagination-current-pill">
              {page} / {totalPages}
            </div>
            <button
              type="button"
              className="pagination-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Details JSON Modal */}
      {selectedDetailJson && (
        <div className="modal-overlay" onClick={() => setSelectedDetailJson(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Event Context Payload</h3>
              <button type="button" onClick={() => setSelectedDetailJson(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <pre style={{
                background: '#090d16',
                color: '#34d399',
                padding: '14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                overflowX: 'auto',
                margin: 0
              }}>
                {typeof selectedDetailJson === 'string'
                  ? selectedDetailJson
                  : JSON.stringify(selectedDetailJson, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
