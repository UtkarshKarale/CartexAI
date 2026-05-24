import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { LockKeyhole, Shield } from 'lucide-react'
import type { CredentialKind } from '../../shared/contracts'

interface LockScreenProps {
  credentialKind: CredentialKind
  credential: string
  error: string | null
  onCredentialChange: (value: string) => void
  onUnlock: () => void
}

export function LockScreen({ credentialKind, credential, error, onCredentialChange, onUnlock }: LockScreenProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/85 px-4 backdrop-blur-xl">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 shadow-[0_24px_90px_rgba(2,6,23,0.45)]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/20">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <div>
            <Badge variant="muted">Session locked</Badge>
            <h2 className="mt-2 text-2xl font-semibold text-white">Unlock to continue</h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-400">
          The desktop assistant has automatically locked after inactivity. No operating system password is required.
        </p>

        <div className="mt-6 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {credentialKind === 'pin' ? 'PIN' : 'Password'}
          </label>
          <Input
            autoFocus
            type="password"
            value={credential}
            onChange={(event) => onCredentialChange(event.target.value)}
            placeholder={credentialKind === 'pin' ? 'Enter your PIN' : 'Enter your password'}
          />
        </div>

        {error ? <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

        <div className="mt-6 flex items-center gap-3">
          <Button className="flex-1" size="lg" onClick={onUnlock}>
            Unlock
          </Button>
          <Button variant="outline" size="lg">
            <Shield className="h-4 w-4" />
            Secure session
          </Button>
        </div>
      </div>
    </div>
  )
}

