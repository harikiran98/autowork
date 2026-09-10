import { useEffect, useState } from 'react'
import type { AutoworkUser } from '../auth/AuthGate'
import { useWorkspace } from '../state/workspaceStore'
import { Modal } from './Modal'

export function AccountPanel({ user, firstRun = false, onClose }: { user: AutoworkUser; firstRun?: boolean; onClose: () => void }) {
  const profile = useWorkspace((state) => state.profile)
  const updateProfile = useWorkspace((state) => state.updateProfile)
  const [ownerName, setOwnerName] = useState(profile.ownerName || user.name)
  const [workspaceName, setWorkspaceName] = useState(profile.workspaceName)
  const [phone, setPhone] = useState(profile.phone)

  useEffect(() => {
    // Deliberately skipped during first run. Backfilling the email there would
    // persist a profile whose workspaceName is still empty, and a stored-but-
    // empty profile defeats hydrate()'s named fallback — so a reload before the
    // dialog was submitted came back showing the generic label instead. First
    // run writes the profile exactly once, on save, with every field present.
    if (!firstRun && !profile.email) updateProfile({ email: user.email })
  }, [firstRun, profile.email, updateProfile, user.email])

  const save = () => {
    if (!workspaceName.trim() || !ownerName.trim()) return
    updateProfile({ ownerName: ownerName.trim(), workspaceName: workspaceName.trim(), email: user.email, phone: phone.trim() })
    onClose()
  }

  return <Modal title={firstRun ? 'Create your workspace' : 'Account & workspace'} onClose={onClose} dismissible={!firstRun}>
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save() }}>
      {firstRun && <p className="rounded-2xl bg-accent-ring px-4 py-3 text-sm leading-relaxed text-ink-soft">Give your office a name. Your agents, files, assignments, and outputs will stay in this browser under your account.</p>}
      <label className="block"><span className="mb-2 block text-xs font-bold text-ink-soft">Your name</span><input aria-label="Your name" autoFocus value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Hari Kiran" className="auth-input" /></label>
      <label className="block"><span className="mb-2 block text-xs font-bold text-ink-soft">Workspace name</span><input aria-label="Workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="My creative studio" className="auth-input" /></label>
      <label className="block"><span className="mb-2 block text-xs font-bold text-ink-soft">Email</span><input aria-label="Account email" value={user.email} readOnly className="auth-input opacity-70" /></label>
      <label className="block"><span className="mb-2 block text-xs font-bold text-ink-soft">Contact number</span><input aria-label="Contact number" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" className="auth-input" /></label>
      <button type="submit" disabled={!workspaceName.trim() || !ownerName.trim()} className="w-full rounded-2xl bg-solid py-3 text-sm font-bold text-on-solid shadow-lg disabled:cursor-not-allowed disabled:opacity-45">{firstRun ? 'Enter workspace' : 'Save account'}</button>
    </form>
  </Modal>
}
