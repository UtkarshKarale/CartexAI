import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Cpu, HardDrive, Zap, RefreshCw, Globe } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import type { InstallProgress, ProviderStatus, PullModelProgress, SystemInfo } from '../../shared/contracts'

interface Props {
  systemInfo: SystemInfo
  providerStatus: ProviderStatus
  onSaveAnthropicKey: (key: string) => void
  onSaveOpenrouterKey: (key: string) => void
  onSaveGeminiKey: (key: string) => void
  onRefresh: () => void
}

type StepState = 'idle' | 'running' | 'done' | 'error' | 'browser'

export function ProviderSetupScreen({ systemInfo, providerStatus, onSaveAnthropicKey, onSaveOpenrouterKey, onSaveGeminiKey, onRefresh }: Props) {
  const [installState, setInstallState] = useState<StepState>('idle')
  const [installLog, setInstallLog] = useState('')
  const [serveState, setServeState] = useState<StepState>('idle')
  const [serveError, setServeError] = useState('')
  const [pullState, setPullState] = useState<StepState>('idle')
  const [pullProgress, setPullProgress] = useState<PullModelProgress | null>(null)

  const [dockerInstallState, setDockerInstallState] = useState<StepState>('idle')
  const [dockerInstallLog, setDockerInstallLog] = useState('')
  const [dockerDaemonState, setDockerDaemonState] = useState<StepState>('idle')
  const [dockerDaemonError, setDockerDaemonError] = useState('')
  const [dockerOllamaState, setDockerOllamaState] = useState<StepState>('idle')
  const [dockerOllamaError, setDockerOllamaError] = useState('')

  const [anthropicKey, setAnthropicKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingOpenrouter, setSavingOpenrouter] = useState(false)
  const [savingGemini, setSavingGemini] = useState(false)

  const model = systemInfo.recommendedModel || 'gemma3:1b'
  const platform = systemInfo.platform

  useEffect(() => {
    window.desktopApi.onInstallProgress((p: InstallProgress) => {
      if (p.browserOpened) {
        // could be ollama or docker install — we track via separate state per card
      }
      setInstallLog(p.status)
      setDockerInstallLog(p.status)
      if (p.done) {
        if (p.browserOpened) {
          setInstallState((s) => s === 'running' ? 'browser' : s)
          setDockerInstallState((s) => s === 'running' ? 'browser' : s)
        } else if (p.error) {
          setInstallState((s) => s === 'running' ? 'error' : s)
          setDockerInstallState((s) => s === 'running' ? 'error' : s)
        } else {
          setInstallState((s) => s === 'running' ? 'done' : s)
          setDockerInstallState((s) => s === 'running' ? 'done' : s)
          setTimeout(() => onRefresh(), 1000)
        }
      }
    })
    window.desktopApi.onPullModelProgress((p: PullModelProgress) => {
      setPullProgress(p)
      if (p.done) {
        setPullState(p.error ? 'error' : 'done')
        if (!p.error) setTimeout(() => onRefresh(), 800)
      }
    })
    return () => {
      window.desktopApi.offInstallProgress()
      window.desktopApi.offPullModelProgress()
    }
  }, [onRefresh])

  const handleInstallOllama = async () => {
    setInstallState('running')
    setInstallLog('Starting…')
    try { await window.desktopApi.installOllama() } catch { setInstallState('error') }
  }

  const handleStartOllama = async () => {
    setServeState('running')
    setServeError('')
    const result = await window.desktopApi.startOllamaServer()
    if (result.success) { setServeState('done'); setTimeout(() => onRefresh(), 2500) }
    else { setServeState('error'); setServeError(result.error ?? 'Failed') }
  }

  const handlePullModel = async () => {
    setPullState('running')
    setPullProgress(null)
    try { await window.desktopApi.pullModel(model) } catch { setPullState('error') }
  }

  const handleInstallDocker = async () => {
    setDockerInstallState('running')
    setDockerInstallLog('Starting…')
    try { await window.desktopApi.installDocker() } catch { setDockerInstallState('error') }
  }

  const handleStartDockerDaemon = async () => {
    setDockerDaemonState('running')
    setDockerDaemonError('')
    const result = await window.desktopApi.startDockerDaemon()
    if (result.success) { setDockerDaemonState('done'); setTimeout(() => onRefresh(), 3000) }
    else { setDockerDaemonState('error'); setDockerDaemonError(result.error ?? 'Failed') }
  }

  const handleStartDockerOllama = async () => {
    setDockerOllamaState('running')
    setDockerOllamaError('')
    const result = await window.desktopApi.startDockerOllama()
    if (result.success) { setDockerOllamaState('done'); setTimeout(() => onRefresh(), 1500) }
    else { setDockerOllamaState('error'); setDockerOllamaError(result.error ?? 'Failed') }
  }

  const handleSaveKey = async () => {
    setSaving(true)
    await onSaveAnthropicKey(anthropicKey.trim())
    setSaving(false)
  }

  const handleSaveOpenrouterKey = async () => {
    setSavingOpenrouter(true)
    await onSaveOpenrouterKey(openrouterKey.trim())
    setSavingOpenrouter(false)
  }

  const handleSaveGeminiKey = async () => {
    setSavingGemini(true)
    await onSaveGeminiKey(geminiKey.trim())
    setSavingGemini(false)
  }

  const ollamaInstallDone = providerStatus.ollamaBinary || installState === 'done'
  const ollamaServeDone = providerStatus.ollama || serveState === 'done'
  const dockerInstallDone = providerStatus.dockerInstalled || dockerInstallState === 'done'
  const dockerDaemonDone = providerStatus.docker || dockerDaemonState === 'done'
  const dockerOllamaDone = providerStatus.dockerOllama || dockerOllamaState === 'done'

  const platformLabel = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux'
  const linuxInstallNote = platform === 'linux' ? 'Runs install script' : 'Opens download page in browser'
  const dockerNote = platform === 'linux' ? 'Runs install script' : 'Opens Docker Desktop download page'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--background))] p-6">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">Set up an AI provider</h1>
          <p className="mt-1 text-sm text-slate-400">Complete any one option to start chatting.</p>
        </div>

        <div className="flex items-center justify-center gap-5 rounded-2xl border border-white/8 bg-white/4 px-5 py-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5 text-[rgb(var(--accent))]" />{systemInfo.ramGb} GB RAM</span>
          <span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5 text-[rgb(var(--accent))]" />{systemInfo.cpuCores} cores</span>
          <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-amber-400" />{platformLabel} · {model}</span>
        </div>

        {/* ── Option 1: Ollama ── */}
        <OptionCard title="Option 1 — Ollama  (local · free)">
          <Step
            index={1}
            label={ollamaInstallDone ? 'Ollama installed' : 'Install Ollama'}
            description={ollamaInstallDone ? 'Binary found on this system' : linuxInstallNote}
            state={ollamaInstallDone ? 'done' : installState === 'running' ? 'running' : installState === 'browser' ? 'browser' : 'idle'}
            log={installLog}
            onAction={handleInstallOllama}
            disabled={ollamaInstallDone || installState === 'running'}
          />
          <Step
            index={2}
            label={ollamaServeDone ? 'Ollama server running' : 'Start Ollama'}
            description={ollamaServeDone ? 'Listening at localhost:11434' : 'Starts the Ollama background server'}
            state={ollamaServeDone ? 'done' : serveState === 'running' ? 'running' : serveState === 'error' ? 'error' : 'idle'}
            log={serveError}
            onAction={handleStartOllama}
            disabled={!ollamaInstallDone || ollamaServeDone || serveState === 'running'}
          />
          <Step
            index={3}
            label={pullState === 'done' ? `${model} ready` : `Pull ${model}`}
            description={
              pullProgress && !pullProgress.done
                ? `${pullProgress.status}${pullProgress.percent > 0 ? ` — ${pullProgress.percent}%` : ''}`
                : pullState === 'running' ? 'Starting download…'
                : `Downloads the ${model} model`
            }
            state={pullState === 'done' ? 'done' : pullState === 'running' ? 'running' : pullState === 'error' ? 'error' : 'idle'}
            progress={pullProgress && !pullProgress.done ? pullProgress.percent : undefined}
            onAction={handlePullModel}
            disabled={!ollamaServeDone || pullState === 'running' || pullState === 'done'}
          />
        </OptionCard>

        {/* ── Option 2: Docker ── */}
        <OptionCard title="Option 2 — Docker Ollama  (local · free)">
          <Step
            index={1}
            label={dockerInstallDone ? 'Docker installed' : 'Install Docker'}
            description={dockerInstallDone ? 'Docker CLI found on this system' : dockerNote}
            state={dockerInstallDone ? 'done' : dockerInstallState === 'running' ? 'running' : dockerInstallState === 'browser' ? 'browser' : 'idle'}
            log={dockerInstallLog}
            onAction={handleInstallDocker}
            disabled={dockerInstallDone || dockerInstallState === 'running'}
          />
          <Step
            index={2}
            label={dockerDaemonDone ? 'Docker daemon running' : 'Start Docker'}
            description={dockerDaemonDone ? 'Docker daemon is active' : platform === 'darwin' ? 'Opens Docker Desktop' : platform === 'linux' ? 'Starts Docker via systemctl' : 'Please start Docker Desktop manually'}
            state={dockerDaemonDone ? 'done' : dockerDaemonState === 'running' ? 'running' : dockerDaemonState === 'error' ? 'error' : 'idle'}
            log={dockerDaemonError}
            onAction={handleStartDockerDaemon}
            disabled={!dockerInstallDone || dockerDaemonDone || dockerDaemonState === 'running'}
          />
          <Step
            index={3}
            label={dockerOllamaDone ? 'Ollama container running' : 'Start Ollama container'}
            description={dockerOllamaDone ? 'Container running at localhost:11434' : 'Pulls and starts the Ollama Docker image'}
            state={dockerOllamaDone ? 'done' : dockerOllamaState === 'running' ? 'running' : dockerOllamaState === 'error' ? 'error' : 'idle'}
            log={dockerOllamaError}
            onAction={handleStartDockerOllama}
            disabled={!dockerDaemonDone || dockerOllamaDone || dockerOllamaState === 'running'}
          />
        </OptionCard>

        {/* ── Option 3: Anthropic ── */}
        <OptionCard title="Option 3 — Anthropic API  (cloud)">
          <p className="mb-3 text-xs text-slate-400">Use Claude models. Get a key from the Anthropic console.</p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="sk-ant-api03-…"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              className="flex-1 text-sm"
            />
            <Button
              disabled={saving || !anthropicKey.trim().startsWith('sk-ant-')}
              onClick={() => void handleSaveKey()}
              className="shrink-0"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & use'}
            </Button>
          </div>
        </OptionCard>

        {/* ── Option 4: OpenRouter ── */}
        <OptionCard title="Option 4 — OpenRouter  (cloud · free tier)">
          <p className="mb-3 text-xs text-slate-400">
            Access free models (Llama 3.3 70B, Qwen3, Gemma 3) with full tool support. Get a free key at openrouter.ai.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="sk-or-v1-…"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              className="flex-1 text-sm"
            />
            <Button
              disabled={savingOpenrouter || !openrouterKey.trim()}
              onClick={() => void handleSaveOpenrouterKey()}
              className="shrink-0"
            >
              {savingOpenrouter ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & use'}
            </Button>
          </div>
        </OptionCard>

        {/* ── Option 5: Gemini ── */}
        <OptionCard title="Option 5 — Google Gemini  (cloud · free tier)">
          <p className="mb-3 text-xs text-slate-400">
            Use Gemini 2.0 Flash with generous free limits. Get a free key at aistudio.google.com.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="AIza…"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="flex-1 text-sm"
            />
            <Button
              disabled={savingGemini || !geminiKey.trim()}
              onClick={() => void handleSaveGeminiKey()}
              className="shrink-0"
            >
              {savingGemini ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & use'}
            </Button>
          </div>
        </OptionCard>

        <Button variant="outline" className="w-full text-sm" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Check again
        </Button>
      </div>
    </div>
  )
}

function OptionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-4 space-y-2">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      {children}
    </div>
  )
}

function Step({
  index,
  label,
  description,
  state,
  log,
  progress,
  onAction,
  disabled,
}: {
  index: number
  label: string
  description: string
  state: StepState
  log?: string
  progress?: number
  onAction: () => void
  disabled: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/6 bg-black/20 px-3 py-2.5">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
        {state === 'done'    && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
        {state === 'error'   && <AlertCircle className="h-4 w-4 text-red-400" />}
        {state === 'running' && <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--accent))]" />}
        {state === 'browser' && <Globe className="h-4 w-4 text-amber-400" />}
        {state === 'idle'    && <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/25 text-[10px] font-bold text-slate-500">{index}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="mt-0.5 text-xs text-slate-400 break-words">
          {state === 'error' && log ? log : description}
        </div>
        {state === 'running' && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-[rgb(var(--accent))] transition-all duration-300 ${!progress ? 'w-1/4 animate-pulse' : ''}`}
              style={progress ? { width: `${progress}%` } : undefined}
            />
          </div>
        )}
      </div>
      {state === 'idle' && (
        <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={onAction} disabled={disabled}>
          Start
        </Button>
      )}
      {state === 'browser' && (
        <span className="shrink-0 text-xs text-amber-400">Waiting…</span>
      )}
    </div>
  )
}
