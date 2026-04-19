import React, { useEffect, useMemo, useState } from 'react'

// ---------- localStorage helpers ----------
const LS_KEY = 'ckpainting.v1'
const GST_RATE = 0.10

const defaultBusiness = {
  name: 'C&K Painting Group',
  abn: '',
  address: '',
  phone: '',
  email: '',
  bsb: '',
  account: '',
  paymentMethods: 'Bank transfer, Cash',
  followUpDays: 5,
}

const defaultState = {
  business: defaultBusiness,
  jobs: [],
  nextInvoiceNumber: 1001,
  nextQuoteNumber: 2001,
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw)
    return {
      ...defaultState,
      ...parsed,
      business: { ...defaultBusiness, ...(parsed.business || {}) },
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    }
  } catch {
    return defaultState
  }
}

function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
}

// ---------- money / date ----------
const money = (n) => {
  const v = Number.isFinite(+n) ? +n : 0
  return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const addDaysISO = (iso, days) => {
  const d = iso ? new Date(iso) : new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
const fmtDateLong = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}
const daysSince = (iso) => {
  if (!iso) return 0
  const d = new Date(iso)
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}
const uid = () => Math.random().toString(36).slice(2, 10)

// ---------- totals ----------
function calcTotals(items = []) {
  const subtotal = items.reduce((sum, it) => {
    const q = +it.qty || 0
    const p = +it.price || 0
    return sum + q * p
  }, 0)
  const gst = +(subtotal * GST_RATE).toFixed(2)
  const total = +(subtotal + gst).toFixed(2)
  return { subtotal: +subtotal.toFixed(2), gst, total }
}

// ---------- status ----------
const STATUSES = ['Quote Sent', 'Approved', 'In Progress', 'Completed', 'Invoiced']
const STATUS_COLORS = {
  'Quote Sent': { bg: '#dbeafe', fg: '#1e40af' },
  'Approved': { bg: '#fef3c7', fg: '#92400e' },
  'In Progress': { bg: '#ede9fe', fg: '#5b21b6' },
  'Completed': { bg: '#d1fae5', fg: '#065f46' },
  'Invoiced': { bg: '#d1fae5', fg: '#065f46' },
}

function isFollowUp(job, days) {
  return job.status === 'Quote Sent' && daysSince(job.quoteSentAt || job.createdAt) >= (days || 5)
}

// ==================================================
//                       APP
// ==================================================
export default function App() {
  const [state, setState] = useState(loadState)
  const [tab, setTab] = useState('jobs') // 'jobs' | 'settings'
  const [view, setView] = useState({ name: 'list' })
  // views:
  //   { name: 'list' }
  //   { name: 'quote', jobId }
  //   { name: 'job', jobId }
  //   { name: 'invoice', jobId }

  useEffect(() => { saveState(state) }, [state])

  const updateBusiness = (patch) =>
    setState((s) => ({ ...s, business: { ...s.business, ...patch } }))

  const upsertJob = (job) =>
    setState((s) => {
      const exists = s.jobs.some((j) => j.id === job.id)
      const jobs = exists
        ? s.jobs.map((j) => (j.id === job.id ? job : j))
        : [job, ...s.jobs]
      return { ...s, jobs }
    })

  const deleteJob = (id) =>
    setState((s) => ({ ...s, jobs: s.jobs.filter((j) => j.id !== id) }))

  const newQuote = () => {
    const id = uid()
    const job = {
      id,
      quoteNumber: state.nextQuoteNumber,
      invoiceNumber: null,
      client: { name: '', email: '', phone: '', address: '' },
      jobTitle: '',
      items: [{ id: uid(), description: '', qty: 1, price: 0 }],
      photos: [],
      notes: '',
      terms: 'Quote valid for 30 days. Prices subject to change after expiry.',
      expiryDate: addDaysISO(todayISO(), 30),
      createdAt: new Date().toISOString(),
      quoteSentAt: null,
      status: 'Quote Sent',
      invoicedAt: null,
    }
    setState((s) => ({ ...s, nextQuoteNumber: s.nextQuoteNumber + 1 }))
    upsertJob(job)
    setView({ name: 'quote', jobId: id })
  }

  const openJob = (id) => setView({ name: 'job', jobId: id })
  const currentJob = view.jobId ? state.jobs.find((j) => j.id === view.jobId) : null

  return (
    <div className="app">
      {tab === 'jobs' && view.name === 'list' && (
        <JobsList
          state={state}
          onNewQuote={newQuote}
          onOpen={openJob}
        />
      )}
      {tab === 'jobs' && view.name === 'quote' && currentJob && (
        <QuoteEditor
          job={currentJob}
          business={state.business}
          onChange={upsertJob}
          onBack={() => setView({ name: 'list' })}
          onDelete={() => { deleteJob(currentJob.id); setView({ name: 'list' }) }}
        />
      )}
      {tab === 'jobs' && view.name === 'job' && currentJob && (
        <JobDetail
          job={currentJob}
          business={state.business}
          onChange={upsertJob}
          onBack={() => setView({ name: 'list' })}
          onEditQuote={() => setView({ name: 'quote', jobId: currentJob.id })}
          onInvoice={() => {
            if (!currentJob.invoiceNumber) {
              const invoiceNumber = state.nextInvoiceNumber
              const updated = {
                ...currentJob,
                invoiceNumber,
                invoicedAt: new Date().toISOString(),
                status: 'Invoiced',
              }
              setState((s) => ({ ...s, nextInvoiceNumber: s.nextInvoiceNumber + 1 }))
              upsertJob(updated)
            } else {
              upsertJob({ ...currentJob, status: 'Invoiced' })
            }
            setView({ name: 'invoice', jobId: currentJob.id })
          }}
          onDelete={() => { deleteJob(currentJob.id); setView({ name: 'list' }) }}
        />
      )}
      {tab === 'jobs' && view.name === 'invoice' && currentJob && (
        <InvoiceView
          job={currentJob}
          business={state.business}
          onBack={() => setView({ name: 'job', jobId: currentJob.id })}
        />
      )}

      {tab === 'settings' && (
        <Settings business={state.business} onChange={updateBusiness} />
      )}

      <BottomNav
        tab={tab}
        onTab={(t) => { setTab(t); setView({ name: 'list' }) }}
        followUpCount={state.jobs.filter((j) => isFollowUp(j, state.business.followUpDays)).length}
      />
    </div>
  )
}

// ==================================================
//                    JOBS LIST
// ==================================================
function JobsList({ state, onNewQuote, onOpen }) {
  const [filter, setFilter] = useState('all') // all | active | followup | invoiced
  const { jobs, business } = state

  const filtered = useMemo(() => {
    let list = [...jobs].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    if (filter === 'active') {
      list = list.filter((j) => j.status !== 'Invoiced' && j.status !== 'Completed')
    } else if (filter === 'invoiced') {
      list = list.filter((j) => j.status === 'Invoiced')
    } else if (filter === 'followup') {
      list = list.filter((j) => isFollowUp(j, business.followUpDays))
    }
    return list
  }, [jobs, filter, business.followUpDays])

  const followUpCount = jobs.filter((j) => isFollowUp(j, business.followUpDays)).length

  return (
    <div className="screen">
      <div className="header">
        <h1>C&K Painting</h1>
        <div className="subtitle">Quote & Job Manager</div>
        <button className="btn btn-primary btn-lg" onClick={onNewQuote}>
          <span className="plus">+</span> New Quote
        </button>
      </div>

      <div className="filters">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
        <Chip active={filter === 'active'} onClick={() => setFilter('active')}>Active</Chip>
        <Chip active={filter === 'followup'} onClick={() => setFilter('followup')} badge={followUpCount}>Follow-up</Chip>
        <Chip active={filter === 'invoiced'} onClick={() => setFilter('invoiced')}>Invoiced</Chip>
      </div>

      <div className="list">
        {filtered.length === 0 && (
          <div className="empty">
            <p>No jobs yet.</p>
            <p>Tap <strong>+ New Quote</strong> to start.</p>
          </div>
        )}
        {filtered.map((job) => {
          const { total } = calcTotals(job.items)
          const flagged = isFollowUp(job, business.followUpDays)
          return (
            <button
              key={job.id}
              className={`card job-card ${flagged ? 'flagged' : ''}`}
              onClick={() => onOpen(job.id)}
            >
              <div className="job-row">
                <div className="job-main">
                  <div className="job-name">{job.client.name || 'Unnamed client'}</div>
                  <div className="job-title">{job.jobTitle || 'Untitled job'}</div>
                </div>
                <div className="job-right">
                  <div className={`job-amount ${job.status === 'Invoiced' ? 'amount-invoiced' : ''}`}>
                    {money(total)}
                  </div>
                  <div className="job-date">{fmtDate(job.createdAt)}</div>
                </div>
              </div>
              <div className="badges">
                <StatusBadge status={job.status} />
                {flagged && <span className="badge badge-followup">Follow-up ⚠</span>}
                {job.invoiceNumber && <span className="badge badge-muted">INV-{job.invoiceNumber}</span>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Chip({ active, children, onClick, badge }) {
  return (
    <button className={`chip ${active ? 'chip-active' : ''}`} onClick={onClick}>
      {children}
      {badge ? <span className="chip-badge">{badge}</span> : null}
    </button>
  )
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#e5e7eb', fg: '#374151' }
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg }}>
      {status}
    </span>
  )
}

// ==================================================
//                    QUOTE EDITOR
// ==================================================
function QuoteEditor({ job, business, onChange, onBack, onDelete }) {
  const update = (patch) => onChange({ ...job, ...patch })
  const updateClient = (patch) => onChange({ ...job, client: { ...job.client, ...patch } })

  const updateItem = (id, patch) => {
    const items = job.items.map((it) => (it.id === id ? { ...it, ...patch } : it))
    onChange({ ...job, items })
  }
  const addItem = () =>
    onChange({ ...job, items: [...job.items, { id: uid(), description: '', qty: 1, price: 0 }] })
  const removeItem = (id) =>
    onChange({ ...job, items: job.items.filter((it) => it.id !== id) })

  const addPhotos = async (files) => {
    const arr = Array.from(files || [])
    const encoded = await Promise.all(
      arr.map(
        (f) =>
          new Promise((res) => {
            const r = new FileReader()
            r.onload = () => res({ id: uid(), name: f.name, data: r.result })
            r.readAsDataURL(f)
          }),
      ),
    )
    onChange({ ...job, photos: [...(job.photos || []), ...encoded] })
  }
  const removePhoto = (id) =>
    onChange({ ...job, photos: (job.photos || []).filter((p) => p.id !== id) })

  const totals = calcTotals(job.items)

  const sendEmail = () => {
    const subject = encodeURIComponent(
      `Quote #${job.quoteNumber} from ${business.name}`,
    )
    const lines = [
      `Hi ${job.client.name || ''},`,
      '',
      `Please find below your quote for: ${job.jobTitle || 'Painting work'}.`,
      '',
      ...job.items.map(
        (it) => `- ${it.description} — ${it.qty} × ${money(it.price)} = ${money((+it.qty || 0) * (+it.price || 0))}`,
      ),
      '',
      `Subtotal: ${money(totals.subtotal)}`,
      `GST (10%): ${money(totals.gst)}`,
      `Total: ${money(totals.total)}`,
      '',
      `Valid until: ${fmtDateLong(job.expiryDate)}`,
      '',
      job.terms,
      '',
      `Thanks,`,
      `${business.name}`,
      business.phone ? `Phone: ${business.phone}` : '',
      business.email ? `Email: ${business.email}` : '',
    ].filter(Boolean)
    const body = encodeURIComponent(lines.join('\n'))
    const to = encodeURIComponent(job.client.email || '')
    onChange({ ...job, quoteSentAt: new Date().toISOString(), status: 'Quote Sent' })
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  }

  return (
    <div className="screen">
      <TopBar title={`Quote #${job.quoteNumber}`} onBack={onBack} />

      <section className="section">
        <h3>Client</h3>
        <input
          className="input"
          placeholder="Client name"
          value={job.client.name}
          onChange={(e) => updateClient({ name: e.target.value })}
        />
        <input
          className="input"
          placeholder="Email"
          type="email"
          value={job.client.email}
          onChange={(e) => updateClient({ email: e.target.value })}
        />
        <input
          className="input"
          placeholder="Phone"
          type="tel"
          value={job.client.phone}
          onChange={(e) => updateClient({ phone: e.target.value })}
        />
        <input
          className="input"
          placeholder="Address"
          value={job.client.address || ''}
          onChange={(e) => updateClient({ address: e.target.value })}
        />
      </section>

      <section className="section">
        <h3>Job</h3>
        <input
          className="input"
          placeholder="Job title / description"
          value={job.jobTitle}
          onChange={(e) => update({ jobTitle: e.target.value })}
        />
      </section>

      <section className="section">
        <h3>Line items</h3>
        {job.items.map((it) => {
          const lineTotal = (+it.qty || 0) * (+it.price || 0)
          return (
            <div key={it.id} className="line-item">
              <input
                className="input"
                placeholder="Description (e.g. Exterior paint — 2 coats)"
                value={it.description}
                onChange={(e) => updateItem(it.id, { description: e.target.value })}
              />
              <div className="line-row">
                <label className="field">
                  <span>Qty</span>
                  <input
                    className="input input-sm"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={it.qty}
                    onChange={(e) => updateItem(it.id, { qty: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Unit price</span>
                  <input
                    className="input input-sm"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={it.price}
                    onChange={(e) => updateItem(it.id, { price: e.target.value })}
                  />
                </label>
                <div className="line-total">{money(lineTotal)}</div>
              </div>
              {job.items.length > 1 && (
                <button className="btn btn-link btn-danger" onClick={() => removeItem(it.id)}>
                  Remove item
                </button>
              )}
            </div>
          )
        })}
        <button className="btn btn-secondary" onClick={addItem}>+ Add line item</button>

        <div className="totals">
          <div className="totals-row"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
          <div className="totals-row"><span>GST (10%)</span><span>{money(totals.gst)}</span></div>
          <div className="totals-row totals-grand"><span>Total</span><span>{money(totals.total)}</span></div>
        </div>
      </section>

      <section className="section">
        <h3>Expiry</h3>
        <input
          className="input"
          type="date"
          value={job.expiryDate}
          onChange={(e) => update({ expiryDate: e.target.value })}
        />
        <textarea
          className="input textarea"
          rows={2}
          value={job.terms}
          onChange={(e) => update({ terms: e.target.value })}
        />
      </section>

      <section className="section">
        <h3>Photos</h3>
        <label className="btn btn-secondary file-btn">
          + Add photos
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => { addPhotos(e.target.files); e.target.value = '' }}
            style={{ display: 'none' }}
          />
        </label>
        <div className="photo-grid">
          {(job.photos || []).map((p) => (
            <div key={p.id} className="photo">
              <img src={p.data} alt={p.name} />
              <button className="photo-remove" onClick={() => removePhoto(p.id)}>×</button>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <button className="btn btn-primary btn-lg" onClick={sendEmail}>
          Send quote by email
        </button>
        <button className="btn btn-secondary" onClick={onBack}>
          Save & close
        </button>
        <button className="btn btn-link btn-danger" onClick={() => {
          if (confirm('Delete this quote permanently?')) onDelete()
        }}>
          Delete quote
        </button>
      </section>
    </div>
  )
}

// ==================================================
//                    JOB DETAIL
// ==================================================
function JobDetail({ job, business, onChange, onBack, onEditQuote, onInvoice, onDelete }) {
  const totals = calcTotals(job.items)

  const sendQuoteEmail = () => {
    const subject = encodeURIComponent(`Quote #${job.quoteNumber} from ${business.name}`)
    const lines = [
      `Hi ${job.client.name || ''},`,
      '',
      `Please find below your quote for: ${job.jobTitle || 'Painting work'}.`,
      '',
      ...job.items.map(
        (it) => `- ${it.description} — ${it.qty} × ${money(it.price)} = ${money((+it.qty || 0) * (+it.price || 0))}`,
      ),
      '',
      `Subtotal: ${money(totals.subtotal)}`,
      `GST (10%): ${money(totals.gst)}`,
      `Total: ${money(totals.total)}`,
      '',
      `Valid until: ${fmtDateLong(job.expiryDate)}`,
      '',
      job.terms,
      '',
      'Thanks,',
      business.name,
      business.phone ? `Phone: ${business.phone}` : '',
      business.email ? `Email: ${business.email}` : '',
    ].filter(Boolean)
    const body = encodeURIComponent(lines.join('\n'))
    const to = encodeURIComponent(job.client.email || '')
    onChange({ ...job, quoteSentAt: new Date().toISOString(), status: 'Quote Sent' })
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  }

  const nextStatus = (() => {
    const idx = STATUSES.indexOf(job.status)
    if (idx < 0 || idx >= STATUSES.length - 1) return null
    return STATUSES[idx + 1]
  })()

  return (
    <div className="screen">
      <div className="detail-topbar">
        <button className="topbar-back" onClick={onBack} aria-label="Back">←</button>
        <div className="detail-heading">
          <div className="detail-client">{job.client.name || 'Unnamed client'}</div>
          <StatusBadge status={job.status} />
        </div>
        <button className="btn-edit" onClick={onEditQuote}>✎ Edit</button>
      </div>

      <section className="card info-card">
        <InfoRow label="CLIENT" value={job.client.name} />
        {job.client.phone && <InfoRow label="PHONE" value={job.client.phone} />}
        {job.client.email && <InfoRow label="EMAIL" value={job.client.email} />}
        {job.client.address && <InfoRow label="ADDRESS" value={job.client.address} />}
        {job.jobTitle && <InfoRow label="JOB" value={job.jobTitle} />}
      </section>

      <section className="card">
        <div className="card-label">LINE ITEMS</div>
        {job.items.map((it) => (
          <div key={it.id} className="line-detail">
            <div className="line-detail-main">
              <div className="line-detail-desc">{it.description || '(no description)'}</div>
              <div className="line-detail-sub">{it.qty} × {money(it.price)}</div>
            </div>
            <div className="line-detail-amount">{money((+it.qty || 0) * (+it.price || 0))}</div>
          </div>
        ))}
        <div className="card-sep" />
        <div className="totals-row"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
        <div className="totals-row"><span>GST (10%)</span><span>{money(totals.gst)}</span></div>
        <div className="totals-row totals-grand"><span>Total (inc. GST)</span><span className="accent">{money(totals.total)}</span></div>
      </section>

      <section className="card">
        <InfoRow label="EXPIRES" value={fmtDateLong(job.expiryDate)} />
        <div className="muted small" style={{ marginTop: 6 }}>{job.terms}</div>
      </section>

      {(job.photos || []).length > 0 && (
        <section className="card">
          <div className="card-label">PHOTOS</div>
          <div className="photo-grid">
            {job.photos.map((p) => (
              <div key={p.id} className="photo"><img src={p.data} alt={p.name} /></div>
            ))}
          </div>
        </section>
      )}

      <section className="section actions">
        <button className="btn btn-primary btn-lg" onClick={sendQuoteEmail}>
          <span className="mail-icon">✉</span> Send Quote via Email
        </button>
        {nextStatus && (
          <button
            className="btn btn-secondary btn-lg"
            onClick={() => onChange({ ...job, status: nextStatus })}
          >
            Mark {nextStatus}
          </button>
        )}
        {(job.status === 'Completed' || job.status === 'In Progress' || job.status === 'Approved') && (
          <button className="btn btn-primary btn-lg" onClick={onInvoice}>
            {job.invoiceNumber ? 'View invoice' : 'Generate invoice'}
          </button>
        )}
        {job.invoiceNumber && job.status === 'Invoiced' && (
          <button className="btn btn-secondary btn-lg" onClick={onInvoice}>
            View invoice (INV-{job.invoiceNumber})
          </button>
        )}
        <button className="btn btn-link btn-danger" onClick={() => {
          if (confirm('Delete this job permanently?')) onDelete()
        }}>
          Delete job
        </button>
      </section>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <div className="info-label">{label}</div>
      <div className="info-value">{value || '—'}</div>
    </div>
  )
}

// ==================================================
//                    INVOICE VIEW
// ==================================================
function InvoiceView({ job, business, onBack }) {
  const totals = calcTotals(job.items)
  const invoiceDate = job.invoicedAt ? job.invoicedAt.slice(0, 10) : todayISO()
  const dueDate = addDaysISO(invoiceDate, 14)

  return (
    <div className="screen">
      <TopBar title={`INV-${job.invoiceNumber}`} onBack={onBack} />

      <div className="section no-print">
        <button className="btn btn-primary btn-lg" onClick={() => window.print()}>
          Download / Print PDF
        </button>
        <p className="muted small">Use your browser's <em>Save as PDF</em> from the print dialog.</p>
      </div>

      <div className="invoice-doc" id="invoice-doc">
        <div className="invoice-head">
          <div>
            <h2 className="biz-name">{business.name}</h2>
            {business.abn && <div className="muted">ABN: {business.abn}</div>}
            {business.address && <div className="muted">{business.address}</div>}
            {business.phone && <div className="muted">{business.phone}</div>}
            {business.email && <div className="muted">{business.email}</div>}
          </div>
          <div className="invoice-meta">
            <div className="invoice-title">TAX INVOICE</div>
            <div><strong>Invoice #:</strong> {job.invoiceNumber}</div>
            <div><strong>Date:</strong> {fmtDateLong(invoiceDate)}</div>
            <div><strong>Due:</strong> {fmtDateLong(dueDate)}</div>
          </div>
        </div>

        <div className="invoice-section">
          <div className="label">Bill to</div>
          <div>{job.client.name}</div>
          {job.client.address && <div className="muted">{job.client.address}</div>}
          {job.client.email && <div className="muted">{job.client.email}</div>}
          {job.client.phone && <div className="muted">{job.client.phone}</div>}
        </div>

        <div className="invoice-section">
          <div className="label">For</div>
          <div>{job.jobTitle}</div>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Unit</th>
              <th className="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {job.items.map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{money(it.price)}</td>
                <td className="num">{money((+it.qty || 0) * (+it.price || 0))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="num">Subtotal</td><td className="num">{money(totals.subtotal)}</td></tr>
            <tr><td colSpan={3} className="num">GST (10%)</td><td className="num">{money(totals.gst)}</td></tr>
            <tr className="grand"><td colSpan={3} className="num">Total (incl. GST)</td><td className="num">{money(totals.total)}</td></tr>
          </tfoot>
        </table>

        <div className="invoice-section">
          <div className="label">Payment terms</div>
          <div>Payment due within 14 days.</div>
        </div>

        <div className="invoice-section">
          <div className="label">Payment details</div>
          <div>{business.name}</div>
          {business.bsb && <div>BSB: {business.bsb}</div>}
          {business.account && <div>Account: {business.account}</div>}
          {business.paymentMethods && <div className="muted">Accepted: {business.paymentMethods}</div>}
        </div>
      </div>
    </div>
  )
}

// ==================================================
//                      SETTINGS
// ==================================================
function Settings({ business, onChange }) {
  return (
    <div className="screen">
      <div className="header">
        <h1>Settings</h1>
        <div className="subtitle">Your business details</div>
      </div>

      <section className="section">
        <h3>Business details</h3>
        <Field label="Business name" value={business.name} onChange={(v) => onChange({ name: v })} />
        <Field label="ABN" value={business.abn} onChange={(v) => onChange({ abn: v })} />
        <Field label="Address" value={business.address} onChange={(v) => onChange({ address: v })} />
        <Field label="Phone" value={business.phone} onChange={(v) => onChange({ phone: v })} />
        <Field label="Email" value={business.email} onChange={(v) => onChange({ email: v })} type="email" />
      </section>

      <section className="section">
        <h3>Bank details (for invoices)</h3>
        <Field label="BSB" value={business.bsb} onChange={(v) => onChange({ bsb: v })} />
        <Field label="Account number" value={business.account} onChange={(v) => onChange({ account: v })} />
        <Field label="Accepted payment methods" value={business.paymentMethods} onChange={(v) => onChange({ paymentMethods: v })} />
      </section>

      <section className="section">
        <h3>Follow-up reminders</h3>
        <label className="field">
          <span>Flag quotes after this many days with no change</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min="1"
            value={business.followUpDays}
            onChange={(e) => onChange({ followUpDays: +e.target.value || 5 })}
          />
        </label>
      </section>

      <section className="section">
        <p className="muted small">
          All data is stored on this device only. Install this app via your browser's "Add to Home screen" to use it like a native app.
        </p>
      </section>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <input
      className="input"
      type={type}
      placeholder={label}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ==================================================
//                   SHARED BITS
// ==================================================
function TopBar({ title, onBack }) {
  return (
    <div className="topbar">
      <button className="topbar-back" onClick={onBack} aria-label="Back">←</button>
      <div className="topbar-title">{title}</div>
      <div style={{ width: 40 }} />
    </div>
  )
}

function BottomNav({ tab, onTab, followUpCount }) {
  return (
    <nav className="bottom-nav no-print">
      <button className={`nav-btn ${tab === 'jobs' ? 'nav-active' : ''}`} onClick={() => onTab('jobs')}>
        <span className="nav-icon" aria-hidden>
          🏠{followUpCount > 0 && <span className="nav-badge">{followUpCount}</span>}
        </span>
        <span>Jobs</span>
      </button>
      <button className={`nav-btn ${tab === 'settings' ? 'nav-active' : ''}`} onClick={() => onTab('settings')}>
        <span className="nav-icon" aria-hidden>⚙️</span>
        <span>Settings</span>
      </button>
    </nav>
  )
}
