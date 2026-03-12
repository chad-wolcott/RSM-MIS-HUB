import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STEPS = [
  'Tenant Type',
  'Client Info',
  'Connection',
  'Vault Mapping',
  'Validation',
  'Review',
]

function CheckResult({ status, label, detail }) {
  const colors = { pass: 'var(--green)', fail: 'var(--red)', running: 'var(--accent)', pending: 'var(--text-3)' }
  const icons  = {
    pass:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><polyline points="20 6 9 17 4 12"/></svg>,
    fail:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    running: <div className="spinner" />,
    pending: <div style={{width:14,height:14,borderRadius:'50%',border:'2px solid var(--border)'}} />,
  }
  return (
    <div className={`check-item ${status}`}>
      <div style={{ color: colors[status], display: 'flex', flexShrink: 0 }}>{icons[status]}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, color: 'var(--text-1)', fontSize: 13 }}>{label}</div>
        {detail && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{detail}</div>}
      </div>
    </div>
  )
}

export default function Onboard() {
  const navigate = useNavigate()
  const [step, setStep]   = useState(0)
  const [done, setDone]   = useState(false)
  const [errors, setErrors] = useState({})

  const [form, setForm]   = useState({
    tenantType:     '',
    clientName:     '',
    clientId:       '',
    contactEmail:   '',
    notes:          '',
    tenantUrl:      '',
    apiEndpoint:    '',
    delineaPath:    '',
    delineaSecretId:'',
  })

  const [checks, setChecks] = useState([
    { label: 'DNS Resolution',        detail: '', status: 'pending' },
    { label: 'TLS Certificate Valid', detail: '', status: 'pending' },
    { label: 'API Endpoint Reachable',detail: '', status: 'pending' },
    { label: 'Credential Auth',       detail: '', status: 'pending' },
  ])

  const [validating, setValidating] = useState(false)
  const [validated, setValidated]   = useState(false)

  const F = (k) => ({ value: form[k], onChange: e => setForm(p => ({...p, [k]: e.target.value})) })

  const validate = (fields) => {
    const e = {}
    fields.forEach(([key, label, type]) => {
      if (!form[key]) { e[key] = `${label} is required`; return }
      if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form[key])) e[key] = 'Invalid email address'
      if (type === 'url'   && !/^https?:\/\//.test(form[key])) e[key] = 'Must be a valid URL (https://…)'
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => {
    if (step === 0 && !form.tenantType) { setErrors({ tenantType: 'Please select a tenant type' }); return }
    if (step === 1) {
      if (!validate([['clientName','Client Name'],['clientId','Client ID'],['contactEmail','Contact Email','email']])) return
    }
    if (step === 2) {
      if (!validate([['tenantUrl','Tenant URL','url'],['apiEndpoint','API Endpoint','url']])) return
    }
    if (step === 3) {
      if (!validate([['delineaPath','Delinea Path'],['delineaSecretId','Secret ID']])) return
    }
    setErrors({})
    setStep(s => s + 1)
  }

  const runValidation = () => {
    setValidating(true)
    setChecks(c => c.map(x => ({ ...x, status: 'pending' })))

    const sequence = [
      { i: 0, delay: 600,  detail: `Resolved: ${form.tenantUrl}` },
      { i: 1, delay: 1200, detail: 'TLS 1.3 — cert valid until 2027-08-01' },
      { i: 2, delay: 2000, detail: `${form.apiEndpoint} → 200 OK` },
      { i: 3, delay: 2900, detail: `Auth token issued — expires in 3600s` },
    ]

    sequence.forEach(({ i, delay, detail }) => {
      setTimeout(() => {
        setChecks(c => c.map((x, ci) => ci < i ? x : ci === i ? { ...x, status: 'running', detail } : x))
        setTimeout(() => {
          setChecks(c => c.map((x, ci) => ci === i ? { ...x, status: 'pass', detail } : x))
          if (i === 3) { setValidating(false); setValidated(true) }
        }, 600)
      }, delay)
    })
  }

  const handleConfirm = () => setDone(true)

  if (done) {
    return (
      <>
        <div className="topbar"><span className="topbar-title">Onboard Tenant</span></div>
        <div className="page-body">
          <div className="card" style={{ maxWidth: 540, margin: '60px auto', textAlign: 'center', padding: '40px 32px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-dim)', border: '2px solid var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" style={{width:28,height:28}}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Tenant Onboarded</h2>
            <p style={{ color: 'var(--text-2)', marginBottom: 6 }}>
              <strong style={{ color: 'var(--text-1)' }}>{form.clientName}</strong> has been successfully added to the Managed Identity Hub.
            </p>
            <p style={{ color: 'var(--text-3)', fontSize: 12.5, marginBottom: 24 }}>
              The tenant is now visible in the tenant list. Initial health-check polling has started.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => navigate('/tenants')}>View Tenant List</button>
              <button className="btn btn-secondary" onClick={() => { setStep(0); setDone(false); setValidated(false); setForm({ tenantType:'',clientName:'',clientId:'',contactEmail:'',notes:'',tenantUrl:'',apiEndpoint:'',delineaPath:'',delineaSecretId:'' }) }}>
                Onboard Another
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Onboard Tenant</span>
        <span className="topbar-sub">— Guided setup wizard</span>
      </div>

      <div className="page-body">
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {/* Step Indicator */}
          <div className="wizard-steps mb-20">
            {STEPS.map((label, i) => (
              <>
                <div key={label} className={`wizard-step${i < step ? ' done' : i === step ? ' active' : ''}`}>
                  <div className="wizard-step-num">
                    {i < step
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{width:13,height:13}}><polyline points="20 6 9 17 4 12"/></svg>
                      : i + 1}
                  </div>
                  <span className="wizard-step-label">{label}</span>
                </div>
                {i < STEPS.length - 1 && <div key={`conn-${i}`} className={`wizard-connector${i < step ? ' done' : ''}`} />}
              </>
            ))}
          </div>

          <div className="card">
            {/* Step 0: Tenant Type */}
            {step === 0 && (
              <div>
                <div className="section-title">Select Tenant Type</div>
                <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 18 }}>
                  Choose the identity platform you are connecting for this client.
                </p>
                <div className="radio-group">
                  <div className={`radio-card${form.tenantType==='ISC'?' selected':''}`}
                    onClick={() => setForm(p => ({...p, tenantType: 'ISC'}))}>
                    <span className="badge badge-isc" style={{alignSelf:'flex-start',marginBottom:6}}>ISC</span>
                    <div className="radio-card-title">SailPoint Identity Security Cloud</div>
                    <div className="radio-card-sub">Cloud-based identity governance platform. Manages identities, access certifications, and lifecycle.</div>
                  </div>
                  <div className={`radio-card${form.tenantType==='PAM'?' selected':''}`}
                    onClick={() => setForm(p => ({...p, tenantType: 'PAM'}))}>
                    <span className="badge badge-pam" style={{alignSelf:'flex-start',marginBottom:6}}>PAM</span>
                    <div className="radio-card-title">CyberArk Privileged Access Management</div>
                    <div className="radio-card-sub">Privileged account management and session recording. Secures critical credentials and privileged access.</div>
                  </div>
                </div>
                {errors.tenantType && <p className="error-msg" style={{marginTop:10}}>{errors.tenantType}</p>}
              </div>
            )}

            {/* Step 1: Client Info */}
            {step === 1 && (
              <div>
                <div className="section-title">Client Information</div>
                <div className="two-col">
                  <div className="input-group">
                    <label className="input-label">Client Name *</label>
                    <input className={`input${errors.clientName?' input-error':''}`} placeholder="e.g. Northgate Defense Systems" {...F('clientName')} />
                    {errors.clientName && <p className="error-msg">{errors.clientName}</p>}
                  </div>
                  <div className="input-group">
                    <label className="input-label">Internal Client ID *</label>
                    <input className={`input${errors.clientId?' input-error':''}`} placeholder="e.g. CLT-0042" {...F('clientId')} />
                    {errors.clientId && <p className="error-msg">{errors.clientId}</p>}
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Primary Contact Email *</label>
                  <input className={`input${errors.contactEmail?' input-error':''}`} type="email" placeholder="contact@client.com" {...F('contactEmail')} />
                  {errors.contactEmail && <p className="error-msg">{errors.contactEmail}</p>}
                </div>
                <div className="input-group">
                  <label className="input-label">Notes</label>
                  <textarea className="input" placeholder="Optional notes about this client or tenant…" {...F('notes')} />
                </div>
              </div>
            )}

            {/* Step 2: Connection Details */}
            {step === 2 && (
              <div>
                <div className="section-title">Tenant Connection Details</div>
                <div className="input-group">
                  <label className="input-label">Tenant URL *</label>
                  <input className={`input${errors.tenantUrl?' input-error':''}`}
                    placeholder={form.tenantType === 'ISC' ? 'https://client.identitynow.com' : 'https://client.cyberark.cloud'}
                    {...F('tenantUrl')} />
                  {errors.tenantUrl && <p className="error-msg">{errors.tenantUrl}</p>}
                </div>
                <div className="input-group">
                  <label className="input-label">API Endpoint URL *</label>
                  <input className={`input${errors.apiEndpoint?' input-error':''}`}
                    placeholder={form.tenantType === 'ISC' ? 'https://client.api.identitynow.com' : 'https://client.cyberark.cloud/PasswordVault'}
                    {...F('apiEndpoint')} />
                  {errors.apiEndpoint && <p className="error-msg">{errors.apiEndpoint}</p>}
                  <p className="input-hint">{form.tenantType === 'ISC' ? 'SailPoint ISC REST API v3/beta base URL' : 'CyberArk PVWA REST API base URL'}</p>
                </div>
              </div>
            )}

            {/* Step 3: Vault Mapping */}
            {step === 3 && (
              <div>
                <div className="section-title">Credential Vault Mapping</div>
                <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 18 }}>
                  Specify the Delinea Secret Server location for the credentials used to access this tenant.
                </p>
                <div className="input-group">
                  <label className="input-label">Delinea Secret Folder Path *</label>
                  <input className={`input${errors.delineaPath?' input-error':''}`}
                    placeholder="Clients/ClientName/ISC-Admin" {...F('delineaPath')} />
                  {errors.delineaPath && <p className="error-msg">{errors.delineaPath}</p>}
                  <p className="input-hint">Folder path within Delinea Secret Server (e.g. Clients/Northgate/ISC-Admin)</p>
                </div>
                <div className="input-group">
                  <label className="input-label">Secret ID *</label>
                  <input className={`input${errors.delineaSecretId?' input-error':''}`}
                    placeholder="e.g. 1042" {...F('delineaSecretId')} />
                  {errors.delineaSecretId && <p className="error-msg">{errors.delineaSecretId}</p>}
                  <p className="input-hint">Numeric ID of the secret record in Delinea</p>
                </div>
                <div className="card card-sm" style={{ background: 'var(--accent-dim)', border: '1px solid rgba(0,156,222,0.2)', marginTop: 8 }}>
                  <p style={{ fontSize: 12.5, color: 'var(--accent)' }}>
                    <strong>Security note:</strong> Credentials are never stored in MIH. They are retrieved from Delinea at launch time via the configured service account and immediately discarded after session establishment.
                  </p>
                </div>
              </div>
            )}

            {/* Step 4: Connectivity Validation */}
            {step === 4 && (
              <div>
                <div className="section-title">Connectivity Validation</div>
                <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>
                  Validate connectivity to <strong style={{ color: 'var(--text-1)' }}>{form.tenantUrl || 'the configured tenant'}</strong> before completing onboarding.
                </p>
                {checks.map((c, i) => <CheckResult key={i} status={c.status} label={c.label} detail={c.detail} />)}
                {!validated && !validating && (
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={runValidation}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    Run Connectivity Test
                  </button>
                )}
                {validating && <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-3)' }}>Running checks…</p>}
                {validated && (
                  <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--green-dim)', border: '1px solid var(--green)', borderRadius: 'var(--radius)', color: 'var(--green)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:14,height:14}}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    All checks passed — ready to confirm onboarding
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Review */}
            {step === 5 && (
              <div>
                <div className="section-title">Review & Confirm</div>
                <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 20 }}>
                  Review the details below before adding this tenant to the Managed Identity Hub.
                </p>
                <ReviewRow label="Tenant Type"      value={<span className={`badge ${form.tenantType==='ISC'?'badge-isc':'badge-pam'}`}>{form.tenantType}</span>} />
                <ReviewRow label="Client Name"      value={form.clientName} />
                <ReviewRow label="Client ID"        value={form.clientId} mono />
                <ReviewRow label="Contact Email"    value={form.contactEmail} />
                <ReviewRow label="Tenant URL"       value={form.tenantUrl} mono />
                <ReviewRow label="API Endpoint"     value={form.apiEndpoint} mono />
                <ReviewRow label="Delinea Path"     value={form.delineaPath} mono />
                <ReviewRow label="Delinea Secret ID"value={form.delineaSecretId} mono />
                {form.notes && <ReviewRow label="Notes" value={form.notes} />}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => { if (step === 0) navigate('/') ; else setStep(s => s-1) }}>
              {step === 0 ? 'Cancel' : '← Back'}
            </button>
            {step < 5
              ? <button className="btn btn-primary" onClick={next}
                  disabled={step === 4 && !validated}>
                  {step === 4 ? 'Continue →' : 'Next →'}
                </button>
              : <button className="btn btn-success" onClick={handleConfirm}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:13,height:13}}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Confirm Onboarding
                </button>
            }
          </div>
        </div>
      </div>
    </>
  )
}

function ReviewRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)', gap: 16, alignItems: 'flex-start' }}>
      <span style={{ width: 160, flexShrink: 0, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-3)', paddingTop: 2 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 12.5 : 13, color: 'var(--text-1)', flex: 1, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}
