import { useState, useMemo } from 'react'
import { MOCK_TENANTS } from '../data/mock'

// ── Launch Modal ──────────────────────────────────────────────────────────────
function LaunchModal({ tenant, onClose }) {
  const [step, setStep] = useState(0)
  const [error, setError] = useState(false)

  const steps = [
    { label: 'Validating analyst session',    sub: 'Checking authentication token & role authorization…' },
    { label: 'Retrieving credentials',        sub: `Fetching from Delinea: ${tenant.delineaSecret}` },
    { label: 'Establishing secure session',   sub: `Authenticating to ${tenant.type === 'ISC' ? 'SailPoint ISC' : 'CyberArk PAM'}…` },
    { label: 'Opening tenant console',        sub: `Launching ${tenant.client} in new tab…` },
  ]

  const runLaunch = () => {
    setStep(1)
    setError(false)
    const run = (s) => {
      setTimeout(() => {
        if (s < steps.length) {
          setStep(s + 1)
          run(s + 1)
        }
      }, s === 1 ? 1400 : 900)
    }
    run(1)
  }

  const isComplete = step > steps.length

  const status = (i) => {
    if (step === 0) return 'pending'
    if (i < step)  return 'success'
    if (i === step) return 'running'
    return 'pending'
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${tenant.type === 'ISC' ? 'badge-isc' : 'badge-pam'}`}>{tenant.type}</span>
            <span className="modal-title">{tenant.client}</span>
          </div>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16, fontFamily: 'var(--font-mono)' }}>
            {tenant.url}
          </p>
          {steps.map((s, i) => {
            const st = status(i + 1)
            return (
              <div className="launch-step" key={i}>
                <div className={`launch-step-icon ${st}`}>
                  {st === 'running' && <div className="spinner" />}
                  {st === 'success' && <CheckIcon />}
                  {st === 'pending' && <span style={{ fontSize: 11, fontWeight: 700 }}>{i + 1}</span>}
                  {st === 'error'   && <XIcon />}
                </div>
                <div>
                  <div className={`launch-step-label ${st === 'running' ? 'active' : st === 'success' ? 'done' : ''}`}>{s.label}</div>
                  {st !== 'pending' && <div className="launch-step-sublabel">{s.sub}</div>}
                </div>
              </div>
            )
          })}

          {step > steps.length && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 'var(--radius)', color: 'var(--green)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckIcon /> <strong>Console opened successfully</strong> — {tenant.client}
            </div>
          )}
          {error && (
            <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', color: 'var(--red)', fontSize: 13 }}>
              <strong>Credential retrieval failed.</strong> The Delinea vault may be unreachable. Please retry or contact your administrator.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            {step > steps.length ? 'Close' : 'Cancel'}
          </button>
          {step === 0 && (
            <button className="btn btn-primary" onClick={runLaunch}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Launch Tenant
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}>
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

// ── Tenants Page ──────────────────────────────────────────────────────────────
export default function Tenants() {
  const [search, setSearch]     = useState('')
  const [typeFilter, setType]   = useState('All')
  const [statusFilter, setStat] = useState('All')
  const [sortCol, setSortCol]   = useState('client')
  const [sortDir, setSortDir]   = useState('asc')
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [launching, setLaunching] = useState(null)
  const [toast, setToast]       = useState(null)

  const filtered = useMemo(() => {
    return MOCK_TENANTS
      .filter(t => {
        const q = search.toLowerCase()
        if (q && !t.client.toLowerCase().includes(q) && !t.url.toLowerCase().includes(q)) return false
        if (typeFilter !== 'All' && t.type !== typeFilter) return false
        if (statusFilter !== 'All' && t.health !== statusFilter.toLowerCase()) return false
        return true
      })
      .sort((a, b) => {
        let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
        if (typeof av === 'string') av = av.toLowerCase()
        if (typeof bv === 'string') bv = bv.toLowerCase()
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
  }, [search, typeFilter, statusFilter, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)

  const sort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url)
    setToast('URL copied to clipboard')
    setTimeout(() => setToast(null), 2500)
  }

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span style={{ opacity: 0.2, marginLeft: 3 }}>↕</span>
    return <span style={{ marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const healthBadge = (h) => <span className={`badge badge-health-${h}`}><span className={`health-dot ${h}`} />{h.charAt(0).toUpperCase() + h.slice(1)}</span>

  const vaCell = (t) => {
    if (t.vaUnhealthy > 0) return <>{t.vas} <span style={{ color: 'var(--red)', fontSize: 11 }}>({t.vaUnhealthy} unhealthy)</span></>
    return t.vas
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Tenant List</span>
        <span className="topbar-sub">— {filtered.length} tenants</span>
        <div className="topbar-right">
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Page size:</span>
          <select className="input select" style={{ width: 70, padding: '5px 28px 5px 8px', fontSize: 12 }}
            value={pageSize} onChange={e => { setPageSize(+e.target.value); setPage(1) }}>
            {[10,25,50,100].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        <div className="table-wrap">
          {/* Filters */}
          <div className="table-header">
            <div className="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input className="input" placeholder="Search by client name or URL…"
                value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
            </div>
            <select className="input select" style={{ width: 130, padding: '7px 30px 7px 10px' }}
              value={typeFilter} onChange={e => { setType(e.target.value); setPage(1) }}>
              {['All','ISC','PAM'].map(o => <option key={o}>{o}</option>)}
            </select>
            <select className="input select" style={{ width: 140, padding: '7px 30px 7px 10px' }}
              value={statusFilter} onChange={e => { setStat(e.target.value); setPage(1) }}>
              {['All','Healthy','Degraded','Offline'].map(o => <option key={o}>{o}</option>)}
            </select>
            {(search || typeFilter !== 'All' || statusFilter !== 'All') && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setType('All'); setStat('All'); setPage(1) }}>
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th onClick={() => sort('client')} className={sortCol==='client'?'sorted':''}>Client Name <SortIcon col="client"/></th>
                  <th onClick={() => sort('type')}   className={sortCol==='type'?'sorted':''}>Type <SortIcon col="type"/></th>
                  <th onClick={() => sort('health')} className={sortCol==='health'?'sorted':''}>Health <SortIcon col="health"/></th>
                  <th onClick={() => sort('vas')}    className={sortCol==='vas'?'sorted':''}>VAs <SortIcon col="vas"/></th>
                  <th onClick={() => sort('identities')} className={sortCol==='identities'?'sorted':''}>Identities / Accounts <SortIcon col="identities"/></th>
                  <th>Tenant URL</th>
                  <th style={{ width: 110 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <h3>No tenants found</h3>
                        <p>Try adjusting your search or filters</p>
                      </div>
                    </td>
                  </tr>
                ) : paginated.map(t => (
                  <tr key={t.id}>
                    <td className="td-primary">{t.client}</td>
                    <td><span className={`badge ${t.type === 'ISC' ? 'badge-isc' : 'badge-pam'}`}>{t.type}</span></td>
                    <td>{healthBadge(t.health)}</td>
                    <td className="mono">{vaCell(t)}</td>
                    <td className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {t.type === 'ISC' ? (t.identities || 0).toLocaleString() : (t.accounts || 0).toLocaleString()}
                    </td>
                    <td>
                      <div className="url-cell" onClick={() => copyUrl(t.url)} title={t.url}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:11,height:11,flexShrink:0}}>
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                        <span className="truncate">{t.url.replace('https://','')}</span>
                      </div>
                    </td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => setLaunching(t)}
                        style={{ minWidth: 80 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12}}>
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Launch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">
                Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize, filtered.length)} of {filtered.length}
              </span>
              <div className="pagination-btns">
                <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className="page-btn" onClick={() => setPage(p => p-1)} disabled={page === 1}>‹</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 3, totalPages - 6)) + i
                  return p <= totalPages ? (
                    <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                  ) : null
                })}
                <button className="page-btn" onClick={() => setPage(p => p+1)} disabled={page === totalPages}>›</button>
                <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {launching && <LaunchModal tenant={launching} onClose={() => setLaunching(null)} />}

      {toast && (
        <div className="toast-container">
          <div className="toast">{toast}</div>
        </div>
      )}
    </>
  )
}
