import { useState } from 'react'
import { MOCK_USERS } from '../data/mock'

const TABS = ['General', 'Identity Provider', 'Users', 'Vault Config', 'Health Check', 'SIEM', 'System Health']

// ── Setting Row ───────────────────────────────────────────────────────────────
function SettingRow({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid var(--border-subtle)', gap: 20 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, color: 'var(--text-1)', fontSize: 13 }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0, minWidth: 260 }}>{children}</div>
    </div>
  )
}

function SecretInput({ placeholder, defaultValue }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input className="input" type={revealed ? 'text' : 'password'} defaultValue={defaultValue} placeholder={placeholder} style={{ flex: 1 }} />
      <button className="btn-icon" onClick={() => setRevealed(r => !r)} title={revealed ? 'Hide' : 'Reveal'}>
        {revealed
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15}}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15}}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
      </button>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function General() {
  const [saved, setSaved] = useState(false)
  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  return (
    <div>
      <SettingRow label="Application Display Name" hint="Shown in browser tab and login page">
        <input className="input" defaultValue="RSM Defense — Managed Identity Hub" />
      </SettingRow>
      <SettingRow label="Default Session Timeout (Idle)" hint="Minutes before idle session expires">
        <select className="input select">
          <option>15 minutes</option><option selected>30 minutes</option><option>60 minutes</option>
        </select>
      </SettingRow>
      <SettingRow label="Absolute Session Timeout" hint="Maximum session duration regardless of activity">
        <select className="input select">
          <option>4 hours</option><option selected>8 hours</option><option>12 hours</option>
        </select>
      </SettingRow>
      <SettingRow label="Dashboard Auto-Refresh Interval" hint="How often dashboard statistics are refreshed">
        <select className="input select">
          <option>1 minute</option><option>2 minutes</option><option selected>5 minutes</option><option>10 minutes</option>
        </select>
      </SettingRow>
      <SettingRow label="Default Pagination Size" hint="Default rows shown in tenant and audit tables">
        <select className="input select">
          <option>10</option><option selected>25</option><option>50</option><option>100</option>
        </select>
      </SettingRow>
      <SettingRow label="Timezone" hint="Timezone for all displayed timestamps">
        <select className="input select">
          <option selected>UTC</option><option>America/New_York</option><option>America/Chicago</option><option>America/Los_Angeles</option>
        </select>
      </SettingRow>
      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={save}>
          {saved ? '✓ Saved' : 'Save Changes'}
        </button>
        <button className="btn btn-ghost">Reset to Defaults</button>
      </div>
    </div>
  )
}

function IdpConfig() {
  const [provider, setProvider] = useState('Entra ID')
  return (
    <div>
      <div className="input-group" style={{marginBottom: 20}}>
        <label className="input-label">Active Identity Provider</label>
        <div style={{ display: 'flex', gap: 10 }}>
          {['Entra ID','Okta','Both'].map(p => (
            <div key={p} className={`radio-card${provider===p?' selected':''}`} style={{ flex: 'none', minWidth: 120 }}
              onClick={() => setProvider(p)}>
              <div className="radio-card-title">{p}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="section-title">OIDC Configuration — {provider}</div>
      <SettingRow label="Authority URL">
        <input className="input" defaultValue={provider === 'Okta' ? 'https://rsm-defense.okta.com/oauth2/default' : 'https://login.microsoftonline.com/{tenant-id}/v2.0'} />
      </SettingRow>
      <SettingRow label="Client ID">
        <input className="input" defaultValue="a4f8b2c1-3d9e-4f7a-b6c5-e2d1f8a09b3c" />
      </SettingRow>
      <SettingRow label="Client Secret" hint="Stored encrypted at rest">
        <SecretInput defaultValue="••••••••••••••••••••••••••••••••" />
      </SettingRow>
      <SettingRow label="Redirect URI">
        <input className="input" defaultValue="https://mih.rsmdefense.com/auth/callback" />
      </SettingRow>
      <SettingRow label="Scopes">
        <input className="input" defaultValue="openid profile email groups" />
      </SettingRow>
      <div className="divider" />
      <div className="section-title">Group → Role Mapping</div>
      {[
        { group: 'MIH-Admins',    role: 'Administrator' },
        { group: 'MIH-Analysts',  role: 'Analyst' },
        { group: 'MIH-Onboarding',role: 'Onboarding Agent' },
        { group: 'MIH-Auditors',  role: 'Read-Only Auditor' },
      ].map(m => (
        <div key={m.group} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <input className="input" defaultValue={m.group} style={{ flex: 1 }} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:14,height:14,color:'var(--text-3)',flexShrink:0}}>
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
          <select className="input select" style={{ width: 170 }} defaultValue={m.role}>
            <option>Administrator</option><option>Analyst</option><option>Onboarding Agent</option><option>Read-Only Auditor</option>
          </select>
        </div>
      ))}
      <div style={{ marginTop: 20 }}>
        <button className="btn btn-primary">Save Configuration</button>
      </div>
    </div>
  )
}

function Users() {
  const [users, setUsers] = useState(MOCK_USERS)
  const roleColors = { 'Administrator': 'var(--red)', 'Onboarding Agent': 'var(--accent)', 'Analyst': 'var(--green)', 'Read-Only Auditor': 'var(--rsm-gray)' }
  const toggle = (id) => setUsers(u => u.map(x => x.id === id ? { ...x, status: x.status === 'active' ? 'disabled' : 'active' } : x))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--text-2)', fontSize: 13 }}>{users.filter(u => u.status === 'active').length} active, {users.filter(u => u.status === 'disabled').length} disabled</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th><th>Email</th><th>Role</th><th>IdP</th><th>Last Login</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ opacity: u.status === 'disabled' ? 0.55 : 1 }}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{u.initials}</div>
                    <span className="td-primary">{u.name}</span>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                <td>
                  <select className="input select" defaultValue={u.role}
                    style={{ padding: '4px 24px 4px 8px', fontSize: 12, border: '1px solid transparent', background: 'transparent', color: roleColors[u.role] || 'var(--text-2)' }}>
                    <option>Administrator</option><option>Analyst</option><option>Onboarding Agent</option><option>Read-Only Auditor</option>
                  </select>
                </td>
                <td><span className="tag">{u.idp}</span></td>
                <td className="mono" style={{ fontSize: 11.5 }}>{u.lastLogin}</td>
                <td>
                  <span className={`pill ${u.status === 'active' ? 'pill-success' : 'pill-failed'}`}>
                    {u.status}
                  </span>
                </td>
                <td>
                  <button className={`btn btn-sm ${u.status === 'active' ? 'btn-ghost' : 'btn-secondary'}`} onClick={() => toggle(u.id)}>
                    {u.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VaultConfig() {
  return (
    <div>
      <div className="section-title">Delinea Secret Server Connection</div>
      <SettingRow label="Vault URL" hint="Base URL for Delinea Secret Server REST API">
        <input className="input" defaultValue="https://vault.rsmdefense.com/SecretServer" />
      </SettingRow>
      <SettingRow label="Service Account Username" hint="Dedicated service account with least-privilege access">
        <input className="input" defaultValue="svc-mih-delinea" />
      </SettingRow>
      <SettingRow label="Service Account Password" hint="Stored encrypted at rest; supports rotation without restart">
        <SecretInput defaultValue="••••••••••••••••" />
      </SettingRow>
      <SettingRow label="Default Secret Folder" hint="Root folder for all tenant credentials">
        <input className="input" defaultValue="Clients" />
      </SettingRow>
      <SettingRow label="Connection Status">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="health-dot healthy" />
          <span style={{ color: 'var(--green)', fontSize: 13, fontWeight: 500 }}>Connected</span>
          <span className="mono" style={{ color: 'var(--text-3)' }}>Last verified: 09:20:01</span>
        </div>
      </SettingRow>
      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <button className="btn btn-primary">Save Configuration</button>
        <button className="btn btn-secondary">Test Connection</button>
      </div>
    </div>
  )
}

function HealthCheckConfig() {
  return (
    <div>
      <div className="section-title">Health Check Polling</div>
      <SettingRow label="Polling Interval" hint="How frequently the backend polls each tenant's API">
        <select className="input select">
          <option>1 minute</option><option selected>3 minutes</option><option>5 minutes</option><option>10 minutes</option>
        </select>
      </SettingRow>
      <SettingRow label="API Timeout Threshold" hint="Maximum wait for tenant API response before marking degraded">
        <select className="input select">
          <option>5 seconds</option><option selected>10 seconds</option><option>15 seconds</option><option>30 seconds</option>
        </select>
      </SettingRow>
      <SettingRow label="Retry Attempts" hint="Number of retries before marking tenant offline">
        <select className="input select">
          <option>1</option><option selected>3</option><option>5</option>
        </select>
      </SettingRow>
      <SettingRow label="Retry Backoff" hint="Strategy for spacing retry attempts">
        <select className="input select">
          <option>Fixed (2s)</option><option selected>Exponential (2s, 4s, 8s…)</option>
        </select>
      </SettingRow>
      <SettingRow label="Degraded → Offline Threshold" hint="Minutes before degraded tenant is marked offline">
        <select className="input select">
          <option>5 minutes</option><option selected>15 minutes</option><option>30 minutes</option>
        </select>
      </SettingRow>
      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <button className="btn btn-primary">Save Configuration</button>
        <button className="btn btn-secondary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Poll All Tenants Now
        </button>
      </div>
    </div>
  )
}

function Siem() {
  const [proto, setProto] = useState('Webhook')
  return (
    <div>
      <div className="section-title">SIEM Integration</div>
      <SettingRow label="Export Protocol">
        <div style={{ display: 'flex', gap: 8 }}>
          {['Syslog (RFC 5424)', 'Webhook', 'Disabled'].map(p => (
            <div key={p} className={`radio-card${proto===p?' selected':''}`} style={{ flex: 1, minWidth: 0 }}
              onClick={() => setProto(p)}>
              <div className="radio-card-title" style={{ fontSize: 12 }}>{p}</div>
            </div>
          ))}
        </div>
      </SettingRow>
      {proto === 'Webhook' && <>
        <SettingRow label="Webhook URL" hint="POST endpoint for log events">
          <input className="input" placeholder="https://siem.example.com/ingest" />
        </SettingRow>
        <SettingRow label="Webhook Secret" hint="HMAC signing secret for payload verification">
          <SecretInput placeholder="Enter signing secret" />
        </SettingRow>
        <SettingRow label="Event Types" hint="Which events to stream">
          {['LOGIN_SUCCESS','LOGIN_FAILED','TENANT_LAUNCH','CONFIG_CHANGE','TENANT_ONBOARD','ROLE_CHANGE'].map(et => (
            <label key={et} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked style={{ accentColor: 'var(--accent)' }} />
              <span className="mono">{et}</span>
            </label>
          ))}
        </SettingRow>
      </>}
      {proto === 'Syslog (RFC 5424)' && <>
        <SettingRow label="Syslog Host"><input className="input" placeholder="siem.internal.example.com" /></SettingRow>
        <SettingRow label="Port"><input className="input" defaultValue="514" style={{ width: 100 }} /></SettingRow>
        <SettingRow label="Protocol">
          <select className="input select"><option>UDP</option><option>TCP</option><option selected>TLS</option></select>
        </SettingRow>
      </>}
      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" disabled={proto === 'Disabled'}>Save Configuration</button>
        {proto !== 'Disabled' && <button className="btn btn-secondary">Send Test Event</button>}
      </div>
    </div>
  )
}

function SystemHealth() {
  const items = [
    { name: 'Backend API',        sub: 'api.mih.rsmdefense.com', status: 'healthy',  detail: '45ms avg response' },
    { name: 'Database',           sub: 'PostgreSQL 16',           status: 'healthy',  detail: 'Primary replica healthy' },
    { name: 'Delinea Vault',      sub: 'vault.rsmdefense.com',    status: 'healthy',  detail: 'Last check: 09:22:01' },
    { name: 'Entra ID',           sub: 'login.microsoftonline.com',status: 'healthy', detail: 'OIDC endpoint reachable' },
    { name: 'Okta',               sub: 'rsm-defense.okta.com',    status: 'healthy',  detail: 'OIDC endpoint reachable' },
    { name: 'SailPoint ISC APIs', sub: '12 tenants polled',        status: 'degraded', detail: '2 tenants unreachable' },
    { name: 'CyberArk PAM APIs',  sub: '8 tenants polled',         status: 'degraded', detail: '1 tenant unreachable' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {[{ label:'Active Sessions', val: 6 }, { label: 'Uptime', val: '99.8%' }, { label: 'API Requests/hr', val: '1,204' }].map(s => (
          <div key={s.label} className="card card-sm" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{s.val}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="section-title">Component Health</div>
      <div className="card card-sm">
        {items.map(item => (
          <div key={item.name} className="health-row">
            <span className={`health-dot ${item.status}`} />
            <div style={{ flex: 1 }}>
              <div className="health-row-name">{item.name}</div>
              <div className="health-row-sub">{item.sub}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Admin Page ────────────────────────────────────────────────────────────────
export default function Admin() {
  const [activeTab, setActiveTab] = useState('General')
  const content = { General: <General />, 'Identity Provider': <IdpConfig />, Users: <Users />, 'Vault Config': <VaultConfig />, 'Health Check': <HealthCheckConfig />, SIEM: <Siem />, 'System Health': <SystemHealth /> }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Administration</span>
        <div className="topbar-right">
          <span style={{ fontSize: 11.5, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:12,height:12}}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Administrator access required
          </span>
        </div>
      </div>
      <div className="page-body">
        <div className="tab-bar">
          {TABS.map(t => (
            <button key={t} className={`tab${activeTab===t?' active':''}`} onClick={() => setActiveTab(t)}>{t}</button>
          ))}
        </div>
        <div style={{ maxWidth: 800 }}>
          {content[activeTab]}
        </div>
      </div>
    </>
  )
}
