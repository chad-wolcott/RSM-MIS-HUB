import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MOCK_TENANTS } from '../data/mock'
import { getLiveTenants, removeLiveTenant, updateLiveTenant } from '../lib/tenantStore'

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ source, simulated }) {
  if (source === 'live') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
        background: simulated ? 'rgba(240,168,33,0.1)' : 'rgba(63,156,53,0.12)',
        color:      simulated ? 'var(--amber)'         : 'var(--green)',
        border:     `1px solid ${simulated ? 'rgba(240,168,33,0.25)' : 'rgba(63,156,53,0.25)'}`,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: simulated ? 'var(--amber)' : 'var(--green)',
          animation: simulated ? 'none' : 'livePulse 2s infinite',
        }} />
        {simulated ? 'Simulated' : 'Live'}
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: 'rgba(136,139,141,0.1)',
      color: 'var(--rsm-gray)',
      border: '1px solid rgba(136,139,141,0.2)',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--rsm-gray)' }} />
      Mock
    </span>
  )
}

// ── Launch Modal ──────────────────────────────────────────────────────────────
function LaunchModal({ tenant, onClose }) {
  const [step, setStep] = useState(0)

  const steps = [
    { label: 'Validating analyst session',  sub: 'Checking authentication token & role authorization…' },
    { label: 'Retrieving credentials',
      sub: tenant.source === 'live' && tenant.credentialType === 'local'
        ? `Using stored OAuth2 client credentials for ${tenant.client}`
        : tenant.source === 'live' && tenant.credentialType === 'delinea'
        ? `Fetching from Delinea: ${tenant.delineaPath}`
        : `Fetching from Delinea: ${tenant.delineaSecret || 'Clients/' + tenant.client + '/ISC-Admin'}` },
    { label: 'Establishing secure session', sub: `Authenticating to ${tenant.type === 'ISC' ? 'SailPoint ISC' : 'CyberArk PAM'}…` },
    { label: 'Opening tenant console',      sub: `Launching ${tenant.client} in new tab…` },
  ]

  const runLaunch = () => {
    setStep(1)
    const run = (s) => {
      setTimeout(() => { if (s <= steps.length) { setStep(s + 1); run(s + 1) } }, s === 1 ? 1400 : 900)
    }
    run(1)
  }

  const statusOf = (i) => {
    if (step === 0)  return 'pending'
    if (i < step)    return 'success'
    if (i === step)  return 'running'
    return 'pending'
  }

  const isComplete = step > steps.length

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
            <span className={`badge ${tenant.type==='ISC'?'badge-isc':'badge-pam'}`}>{tenant.type}</span>
            <SourceBadge source={tenant.source} simulated={tenant.simulated} />
            <span className="modal-title" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tenant.client}</span>
          </div>
        </div>
        <div className="modal-body">
          <p style={{ fontSize:12.5, color:'var(--text-3)', marginBottom:16, fontFamily:'var(--font-mono)' }}>{tenant.url}</p>

          {/* Credential method indicator */}
          {tenant.source === 'live' && (
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-3)', marginBottom:14, padding:'7px 10px', background:'var(--bg-hover)', borderRadius:'var(--radius)' }}>
              {tenant.credentialType === 'local'
                ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12}}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Local OAuth2 credentials</>
                : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Delinea Secret Server</>}
            </div>
          )}

          {steps.map((s, i) => {
            const st = statusOf(i + 1)
            return (
              <div className="launch-step" key={i}>
                <div className={`launch-step-icon ${st}`}>
                  {st === 'running' && <div className="spinner"/>}
                  {st === 'success' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>}
                  {st === 'pending' && <span style={{fontSize:11,fontWeight:700}}>{i+1}</span>}
                </div>
                <div>
                  <div className={`launch-step-label${st==='running'?' active':st==='success'?' done':''}`}>{s.label}</div>
                  {st !== 'pending' && <div className="launch-step-sublabel">{s.sub}</div>}
                </div>
              </div>
            )
          })}

          {isComplete && (
            <div style={{ marginTop:14, padding:'12px 14px', background:'var(--green-dim)', border:'1px solid var(--green)', borderRadius:'var(--radius)', color:'var(--green)', fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>
              <strong>Console opened</strong> — {tenant.client}
              {tenant.source === 'mock' && <span style={{fontSize:11,opacity:0.7}}>(mock — no real session)</span>}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{isComplete ? 'Close' : 'Cancel'}</button>
          {step === 0 && (
            <button className="btn btn-primary" onClick={runLaunch}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Launch
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Remove confirmation modal ─────────────────────────────────────────────────
function RemoveModal({ tenant, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:420 }}>
        <div className="modal-header">
          <span className="modal-title" style={{color:'var(--red)'}}>Remove Tenant</span>
        </div>
        <div className="modal-body">
          <p style={{fontSize:13.5, color:'var(--text-1)', marginBottom:8}}>
            Remove <strong>{tenant.client}</strong> from the Managed Identity Hub?
          </p>
          <p style={{fontSize:12.5, color:'var(--text-2)'}}>
            This will delete the tenant configuration and credentials from local storage. The action cannot be undone — you will need to onboard this tenant again to reconnect it.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Remove Tenant</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Tenants Page ─────────────────────────────────────────────────────────
export default function Tenants() {
  const navigate = useNavigate()

  const [liveTenants, setLiveTenants] = useState([])
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setType]        = useState('All')
  const [statFilter,  setStat]        = useState('All')
  const [sourceFilter,setSource]      = useState('All')
  const [sortCol,     setSortCol]     = useState('client')
  const [sortDir,     setSortDir]     = useState('asc')
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(25)

  const [launching,   setLaunching]   = useState(null)
  const [removing,    setRemoving]    = useState(null)
  const [toast,       setToast]       = useState(null)

  // Load live tenants from localStorage
  useEffect(() => { setLiveTenants(getLiveTenants()) }, [])

  // Merged tenant list: live first (with source tag), then mock
  const allTenants = useMemo(() => {
    const live = liveTenants.map(t => ({ ...t, source: 'live' }))
    const mock = MOCK_TENANTS.map(t => ({ ...t, source: 'mock' }))
    return [...live, ...mock]
  }, [liveTenants])

  const liveTenantCount = liveTenants.length
  const mockTenantCount = MOCK_TENANTS.length

  const filtered = useMemo(() => {
    return allTenants
      .filter(t => {
        const q = search.toLowerCase()
        if (q && !t.client.toLowerCase().includes(q) && !t.url.toLowerCase().includes(q)) return false
        if (typeFilter   !== 'All' && t.type   !== typeFilter)                return false
        if (statFilter   !== 'All' && t.health !== statFilter.toLowerCase())  return false
        if (sourceFilter !== 'All' && t.source !== sourceFilter.toLowerCase()) return false
        return true
      })
      .sort((a, b) => {
        // Always sort live tenants above mock for same-column values
        if (a.source !== b.source && sortCol === 'client') {
          return a.source === 'live' ? -1 : 1
        }
        let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
        if (typeof av === 'string') av = av.toLowerCase()
        if (typeof bv === 'string') bv = bv.toLowerCase()
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1  : -1
        return 0
      })
  }, [allTenants, search, typeFilter, statFilter, sourceFilter, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize)

  const sort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(1)
  }

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url)
    showToast('URL copied to clipboard')
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleRemove = (tenant) => {
    removeLiveTenant(tenant.id)
    setLiveTenants(getLiveTenants())
    setRemoving(null)
    showToast(`${tenant.client} removed`)
  }

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span style={{opacity:0.2,marginLeft:3}}>↕</span>
    return <span style={{marginLeft:3}}>{sortDir==='asc'?'↑':'↓'}</span>
  }

  const healthBadge = (h) => (
    <span className={`badge badge-health-${h}`}>
      <span className={`health-dot ${h}`} />
      {h.charAt(0).toUpperCase() + h.slice(1)}
    </span>
  )

  const vaCell = (t) => t.vaUnhealthy > 0
    ? <>{t.vas} <span style={{color:'var(--red)',fontSize:11}}>({t.vaUnhealthy} unhealthy)</span></>
    : t.vas

  const countCell = (t) => {
    const n = t.type === 'ISC' ? (t.identities ?? 0) : (t.accounts ?? 0)
    return n > 0 ? n.toLocaleString() : <span style={{color:'var(--text-3)',fontStyle:'italic'}}>—</span>
  }

  const clearFilters = () => { setSearch(''); setType('All'); setStat('All'); setSource('All'); setPage(1) }
  const hasFilters   = search || typeFilter !== 'All' || statFilter !== 'All' || sourceFilter !== 'All'

  return (
    <>
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(63,156,53,0.4); }
          50%       { opacity: 0.7; box-shadow: 0 0 0 3px rgba(63,156,53,0); }
        }
      `}</style>

      <div className="topbar">
        <span className="topbar-title">Tenant List</span>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginLeft:8 }}>
          {liveTenantCount > 0 && (
            <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--green)' }}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--green)',animation:'livePulse 2s infinite'}} />
              {liveTenantCount} live
            </span>
          )}
          <span style={{ fontSize:12, color:'var(--text-3)' }}>{mockTenantCount} mock</span>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/onboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Onboard Tenant
          </button>
          <span style={{fontSize:11.5,color:'var(--text-3)'}}>Page size:</span>
          <select className="input select" style={{width:70,padding:'5px 28px 5px 8px',fontSize:12}}
            value={pageSize} onChange={e => { setPageSize(+e.target.value); setPage(1) }}>
            {[10,25,50,100].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        <div className="table-wrap">
          {/* Filters */}
          <div className="table-header" style={{flexWrap:'wrap', gap:8}}>
            <div className="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="input" placeholder="Search by client name or URL…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
            </div>
            <select className="input select" style={{width:90,padding:'7px 28px 7px 10px'}} value={typeFilter} onChange={e=>{setType(e.target.value);setPage(1)}}>
              {['All','ISC','PAM'].map(o => <option key={o}>{o}</option>)}
            </select>
            <select className="input select" style={{width:130,padding:'7px 28px 7px 10px'}} value={statFilter} onChange={e=>{setStat(e.target.value);setPage(1)}}>
              {['All','Healthy','Degraded','Offline'].map(o => <option key={o}>{o}</option>)}
            </select>
            <select className="input select" style={{width:120,padding:'7px 28px 7px 10px'}} value={sourceFilter} onChange={e=>{setSource(e.target.value);setPage(1)}}>
              <option value="All">All Sources</option>
              <option value="live">Live only</option>
              <option value="mock">Mock only</option>
            </select>
            {hasFilters && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
            )}
            <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-3)'}}>{filtered.length} tenant{filtered.length!==1?'s':''}</span>
          </div>

          {/* Table */}
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr>
                  <th onClick={()=>sort('source')}  className={sortCol==='source'?'sorted':''} style={{width:90}}>Source <SortIcon col="source"/></th>
                  <th onClick={()=>sort('client')}  className={sortCol==='client'?'sorted':''}>Client Name <SortIcon col="client"/></th>
                  <th onClick={()=>sort('type')}    className={sortCol==='type'?'sorted':''} style={{width:70}}>Type <SortIcon col="type"/></th>
                  <th onClick={()=>sort('health')}  className={sortCol==='health'?'sorted':''} style={{width:110}}>Health <SortIcon col="health"/></th>
                  <th onClick={()=>sort('vas')}     className={sortCol==='vas'?'sorted':''} style={{width:90}}>VAs <SortIcon col="vas"/></th>
                  <th onClick={()=>sort('identities')} className={sortCol==='identities'?'sorted':''}>Identities / Accounts <SortIcon col="identities"/></th>
                  <th>Tenant URL</th>
                  <th style={{width:130}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={8}>
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:36,height:36,display:'block',margin:'0 auto 10px',opacity:0.2}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <h3>No tenants found</h3>
                      <p>Try adjusting your search or filters</p>
                      {hasFilters && <button className="btn btn-secondary btn-sm" style={{marginTop:12}} onClick={clearFilters}>Clear all filters</button>}
                    </div>
                  </td></tr>
                ) : paginated.map(t => (
                  <tr key={t.id} style={{ background: t.source === 'live' && !t.simulated ? 'rgba(63,156,53,0.025)' : undefined }}>
                    <td><SourceBadge source={t.source} simulated={t.simulated} /></td>
                    <td>
                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <span className="td-primary">{t.client}</span>
                        {t.orgName && t.orgName !== t.client && (
                          <span style={{fontSize:11,color:'var(--text-3)',fontFamily:'var(--font-mono)'}}>{t.orgName}</span>
                        )}
                      </div>
                    </td>
                    <td><span className={`badge ${t.type==='ISC'?'badge-isc':'badge-pam'}`}>{t.type}</span></td>
                    <td>{healthBadge(t.health)}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{vaCell(t)}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{countCell(t)}</td>
                    <td>
                      <div className="url-cell" onClick={() => copyUrl(t.url)} title={t.url}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:11,height:11,flexShrink:0}}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        <span className="truncate">{t.url.replace('https://','')}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{display:'flex',gap:5,alignItems:'center'}}>
                        <button className="btn btn-primary btn-sm" onClick={() => setLaunching(t)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:11,height:11}}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          Launch
                        </button>
                        {/* Only show remove for live tenants */}
                        {t.source === 'live' && (
                          <button
                            className="btn-icon"
                            onClick={() => setRemoving(t)}
                            title="Remove tenant"
                            style={{color:'var(--red)',borderColor:'rgba(232,68,68,0.2)'}}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} of {filtered.length}</span>
              <div className="pagination-btns">
                <button className="page-btn" onClick={()=>setPage(1)} disabled={page===1}>«</button>
                <button className="page-btn" onClick={()=>setPage(p=>p-1)} disabled={page===1}>‹</button>
                {Array.from({length:Math.min(totalPages,7)},(_,i)=>{
                  const p = Math.max(1,Math.min(page-3,totalPages-6))+i
                  return p<=totalPages ? <button key={p} className={`page-btn${p===page?' active':''}`} onClick={()=>setPage(p)}>{p}</button> : null
                })}
                <button className="page-btn" onClick={()=>setPage(p=>p+1)} disabled={page===totalPages}>›</button>
                <button className="page-btn" onClick={()=>setPage(totalPages)} disabled={page===totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display:'flex', gap:20, marginTop:14, padding:'0 4px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-3)' }}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'var(--green)',animation:'livePulse 2s infinite'}} />
            Live — real tenant, actively connected
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-3)' }}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'var(--amber)'}} />
            Simulated — validated locally without Netlify Functions
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-3)' }}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'var(--rsm-gray)'}} />
            Mock — example data only
          </div>
        </div>
      </div>

      {launching && <LaunchModal tenant={launching} onClose={() => setLaunching(null)} />}
      {removing  && <RemoveModal tenant={removing} onConfirm={() => handleRemove(removing)} onClose={() => setRemoving(null)} />}

      {toast && (
        <div className="toast-container"><div className="toast">{toast}</div></div>
      )}
    </>
  )
}
