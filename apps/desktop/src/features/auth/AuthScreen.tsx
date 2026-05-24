import { Fingerprint, LockKeyhole, Shield } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Switch } from '../../components/ui/switch'
import type { CredentialKind } from '../../shared/contracts'

interface AuthScreenProps {
  mode: 'setup' | 'login'
  credentialKind: CredentialKind
  displayName: string
  credential: string
  rememberDevice: boolean
  error: string | null
  submitting: boolean
  onDisplayNameChange: (value: string) => void
  onCredentialChange: (value: string) => void
  onRememberDeviceChange: (value: boolean) => void
  onCredentialKindChange: (value: CredentialKind) => void
  onSubmit: () => void
}

export function AuthScreen({
  mode,
  credentialKind,
  displayName,
  credential,
  rememberDevice,
  error,
  submitting,
  onDisplayNameChange,
  onCredentialChange,
  onRememberDeviceChange,
  onCredentialKindChange,
  onSubmit,
}: AuthScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--background))] px-4 py-8 text-[rgb(var(--foreground))]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge variant="muted">xfile.ai</Badge>
          <CardTitle className="mt-4 text-2xl">
            {mode === 'setup' ? 'Create local access' : 'Unlock xfile.ai'}
          </CardTitle>
          <CardDescription>
            Use a PIN or password stored only on this device. The operating system password is never used.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'setup' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgb(var(--muted-foreground))]">
                Display name
              </label>
              <Input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} placeholder="Your name" />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <CredentialButton
              active={credentialKind === 'pin'}
              icon={<Fingerprint className="h-4 w-4" />}
              label="PIN"
              onClick={() => onCredentialKindChange('pin')}
            />
            <CredentialButton
              active={credentialKind === 'password'}
              icon={<LockKeyhole className="h-4 w-4" />}
              label="Password"
              onClick={() => onCredentialKindChange('password')}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgb(var(--muted-foreground))]">
              {credentialKind === 'pin' ? 'PIN' : 'Password'}
            </label>
            <Input
              type="password"
              value={credential}
              onChange={(event) => onCredentialChange(event.target.value)}
              placeholder={credentialKind === 'pin' ? '1234' : 'Enter password'}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--muted))]/35 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Remember device</div>
              <div className="text-xs text-[rgb(var(--muted-foreground))]">Keep the session trusted on this machine.</div>
            </div>
            <Switch checked={rememberDevice} onClick={() => onRememberDeviceChange(!rememberDevice)} />
          </div>

          {error ? <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}

          <Button className="w-full" size="lg" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Working…' : mode === 'setup' ? 'Create account' : 'Unlock'}
          </Button>

          <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted-foreground))]">
            <Shield className="h-4 w-4" />
            Local-first auth and storage, backed by SQLite.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CredentialButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition',
        active
          ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200'
          : 'border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20 text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]/35',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  )
}
