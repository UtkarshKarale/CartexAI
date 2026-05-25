import { useState, type ReactNode, useEffect, useRef } from 'react'
import {
  RefreshCw,
  Check,
  Loader2,
  Monitor,
  Shield,
  Palette,
  Sparkles,
  X,
  Mail,
  Eye,
  EyeOff,
} from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Switch } from '../../components/ui/switch'
import type { AppSettings, GemmaModelInfo, ThemeMode } from '../../shared/contracts'
import { cn } from '../../lib/utils'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  appVersion: string
  gemmaModels: GemmaModelInfo[]
  onUpdateTheme: (value: ThemeMode) => void
  onUpdateSettings: (updates: Partial<AppSettings>) => Promise<void>
  onCheckForUpdates: () => Promise<void>
  onRefreshModels: () => void
}

export function SettingsPanel({
  isOpen,
  onClose,
  settings,
  appVersion,
  gemmaModels,
  onUpdateTheme,
  onUpdateSettings,
  onCheckForUpdates,
  onRefreshModels,
}: SettingsModalProps) {
  const [anthropicKey, setAnthropicKey] = useState(settings.anthropicKey)
  const [openrouterKey, setOpenrouterKey] = useState(settings.openrouterKey)
  const [geminiKey, setGeminiKey] = useState(settings.geminiKey)
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(settings.openaiBaseUrl)
  const [openaiApiKey, setOpenaiApiKey] = useState(settings.openaiApiKey)
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel)
  const [smtpHost, setSmtpHost] = useState(settings.smtpHost)
  const [smtpPort, setSmtpPort] = useState(String(settings.smtpPort))
  const [smtpUser, setSmtpUser] = useState(settings.smtpUser)
  const [smtpPass, setSmtpPass] = useState(settings.smtpPass)
  const [smtpFrom, setSmtpFrom] = useState(settings.smtpFrom)
  const [smtpFromName, setSmtpFromName] = useState(settings.smtpFromName)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [savingKey, setSavingKey] = useState<'anthropic' | 'openrouter' | 'gemini' | 'openai' | 'smtp' | null>(null)
  const [savedKey, setSavedKey] = useState<'anthropic' | 'openrouter' | 'gemini' | 'openai' | 'smtp' | null>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const saveKey = async (provider: typeof savingKey, updates: Partial<AppSettings>) => {
    setSavingKey(provider)
    setSavedKey(null)
    await onUpdateSettings(updates)
    setSavingKey(null)
    setSavedKey(provider)
    setTimeout(() => setSavedKey(null), 2000)
  }

  const saveSmtp = () =>
    saveKey('smtp', {
      smtpHost: smtpHost.trim(),
      smtpPort: parseInt(smtpPort) || 587,
      smtpUser: smtpUser.trim(),
      smtpPass: smtpPass,
      smtpFrom: smtpFrom.trim(),
      smtpFromName: smtpFromName.trim(),
    })

  const handleCheckForUpdates = async () => {
    setCheckingUpdates(true)
    try {
      await onCheckForUpdates()
    } finally {
      setCheckingUpdates(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={modalRef}
        className="relative flex h-[640px] w-full max-w-[880px] overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--background))] shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Sidebar */}
        <div className="w-[220px] flex-shrink-0 bg-[rgb(var(--sidebar))] border-r border-[rgb(var(--border))] p-4 flex flex-col">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-6">
            <div className="h-6 w-6 rounded-md bg-[rgb(var(--accent))] flex items-center justify-center text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 0 4.93 19.07"/><path d="M15.54 8.46a5 5 0 1 0-7.07 7.07"/></svg>
            </div>
            <span className="font-semibold text-[rgb(var(--foreground))] tracking-tight text-sm">Settings</span>
          </div>

          <nav className="space-y-0.5">
            <SidebarItem active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={<Monitor className="h-4 w-4" />} label="General" />
            <SidebarItem active={activeTab === 'personalization'} onClick={() => setActiveTab('personalization')} icon={<Palette className="h-4 w-4" />} label="Appearance" />
            <SidebarItem active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<Sparkles className="h-4 w-4" />} label="AI Provider" />
            <SidebarItem active={activeTab === 'email'} onClick={() => setActiveTab('email')} icon={<Mail className="h-4 w-4" />} label="Email / SMTP" />
            <SidebarItem active={activeTab === 'security'} onClick={() => setActiveTab('security')} icon={<Shield className="h-4 w-4" />} label="Security" />
          </nav>

          <div className="mt-auto px-3 py-4 border-t border-[rgb(var(--border))]">
            <div className="text-[rgb(var(--muted-foreground))] text-xs font-mono">{appVersion}</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-[rgb(var(--background))]">
          <div className="flex items-center justify-between px-8 py-5 border-b border-[rgb(var(--border))]">
            <h2 className="text-base font-semibold text-[rgb(var(--foreground))] capitalize">
              {activeTab === 'ai' ? 'AI Provider' : activeTab === 'email' ? 'Email / SMTP' : activeTab}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-[rgb(var(--muted))]/40 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar space-y-8">
            {activeTab === 'general' && (
              <div className="space-y-8 animate-in slide-in-from-right-2 duration-300">
                <Section title="Interface">
                  <SettingRow label="Language" description="System language for the xfile.ai interface.">
                    <div className="text-sm font-medium text-[rgb(var(--muted-foreground))]">English (US)</div>
                  </SettingRow>
                </Section>

                <Section title="Data">
                  <SettingRow label="Archived Chats" description="View and manage your archived conversation history.">
                    <Button variant="outline" size="sm" className="text-xs font-semibold border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20">Manage</Button>
                  </SettingRow>
                  <SettingRow label="Delete All Chats" description="Permanently remove all local conversation data.">
                    <Button variant="outline" size="sm" className="bg-red-500/10 border-red-500/20 text-red-500 text-xs font-semibold hover:bg-red-500 hover:text-white">Delete all</Button>
                  </SettingRow>
                </Section>

                <Section title="Updates">
                  <SettingRow label="App Version" description="Installed desktop build version.">
                    <Badge variant="outline" className="normal-case tracking-normal text-[11px] font-semibold">
                      {appVersion}
                    </Badge>
                  </SettingRow>
                  <SettingRow label="Check for Updates" description="Verify GitHub release auto-update is working.">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCheckForUpdates()}
                      disabled={checkingUpdates}
                      className="text-xs font-semibold border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20"
                    >
                      {checkingUpdates ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {checkingUpdates ? 'Checking…' : 'Check now'}
                    </Button>
                  </SettingRow>
                </Section>
              </div>
            )}

            {activeTab === 'personalization' && (
              <div className="space-y-8 animate-in slide-in-from-right-2 duration-300">
                <Section title="Theme">
                  <div className="grid grid-cols-3 gap-3">
                    {(['dark', 'light', 'system'] as ThemeMode[]).map((theme) => (
                      <button
                        key={theme}
                        onClick={() => onUpdateTheme(theme)}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                          settings.theme === theme
                            ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 text-[rgb(var(--foreground))]'
                            : 'border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20 text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))]/40',
                        )}
                      >
                        {theme === 'dark' && <MoonIcon className="h-5 w-5" />}
                        {theme === 'light' && <SunIcon className="h-5 w-5" />}
                        {theme === 'system' && <Monitor className="h-5 w-5" />}
                        <span className="text-xs font-semibold capitalize">{theme}</span>
                      </button>
                    ))}
                  </div>
                </Section>

                <Section title="Accent Color">
                  <div className="grid grid-cols-4 gap-3">
                    {([
                      { id: 'slate', color: 'bg-slate-400' },
                      { id: 'blue', color: 'bg-blue-500' },
                      { id: 'emerald', color: 'bg-emerald-500' },
                      { id: 'amber', color: 'bg-amber-500' },
                    ] as const).map(({ id, color }) => (
                      <button
                        key={id}
                        onClick={() => onUpdateSettings({ accent: id })}
                        className={cn(
                          'group relative flex items-center justify-between rounded-xl border px-4 py-3 transition-all',
                          settings.accent === id
                            ? 'border-[rgb(var(--accent))]/50 bg-[rgb(var(--accent))]/10'
                            : 'border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20 hover:border-[rgb(var(--border))]/60',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn('h-3 w-3 rounded-full shadow-sm', color)} />
                          <span className={cn('text-xs font-bold uppercase tracking-tight', settings.accent === id ? 'text-[rgb(var(--foreground))]' : 'text-[rgb(var(--muted-foreground))]')}>
                            {id}
                          </span>
                        </div>
                        {settings.accent === id && <Check className="h-3.5 w-3.5 text-[rgb(var(--accent))]" />}
                      </button>
                    ))}
                  </div>
                </Section>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-8 animate-in slide-in-from-right-2 duration-300">
                <Section title="Active Provider">
                  <div className="grid grid-cols-3 gap-2">
                    {(['ollama', 'docker-ollama', 'anthropic', 'openrouter', 'gemini', 'gemini-cli', 'openai'] as AppSettings['providerType'][]).map((type) => (
                      <button
                        key={type}
                        onClick={() => onUpdateSettings({ providerType: type })}
                        className={cn(
                          'flex items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-bold transition-all',
                          settings.providerType === type
                            ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-white shadow-sm'
                            : 'border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]/40',
                        )}
                      >
                        {type === 'docker-ollama' ? 'Docker' :
                         type === 'anthropic' ? 'Anthropic' :
                         type === 'openrouter' ? 'OpenRouter' :
                         type === 'gemini' ? 'Gemini API' :
                         type === 'gemini-cli' ? 'Gemini CLI' :
                         type === 'openai' ? 'OpenAI' : 'Ollama'}
                      </button>
                    ))}
                  </div>
                </Section>

                <div className="rounded-2xl bg-[rgb(var(--muted))]/20 border border-[rgb(var(--border))] p-6">
                  {settings.providerType !== 'anthropic' && settings.providerType !== 'openrouter' && settings.providerType !== 'gemini' && settings.providerType !== 'openai' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <label className="text-sm font-bold text-[rgb(var(--foreground))]">Local Model Selection</label>
                          <p className="text-xs text-[rgb(var(--muted-foreground))]">Pick a Gemma model for offline inference.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={onRefreshModels} className="h-8 gap-2 border-[rgb(var(--border))]">
                          <RefreshCw className="h-3 w-3" />
                          <span className="text-[10px] uppercase font-bold tracking-wider">Refresh</span>
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {gemmaModels.map((model) => {
                          const active = settings.defaultModel === model.name
                          return (
                            <button
                              key={model.name}
                              onClick={() => onUpdateSettings({ defaultModel: model.name })}
                              className={cn(
                                'flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all',
                                active ? 'border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/10 text-[rgb(var(--foreground))]' : 'border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))]/20',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-[rgb(var(--accent))]' : 'bg-[rgb(var(--muted-foreground))]/40')} />
                                <span className="text-sm font-bold">{model.name}</span>
                              </div>
                              <span className="text-[10px] font-mono text-[rgb(var(--muted-foreground))]">{(model.sizeMb / 1024).toFixed(1)} GB</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {settings.providerType === 'anthropic' && (
                    <CloudProviderForm
                      title="Claude"
                      models={['claude-haiku-4-5-20251001', 'claude-sonnet-4-6']}
                      selectedModel={settings.anthropicModel}
                      apiKey={anthropicKey}
                      onModelChange={(m: string) => onUpdateSettings({ anthropicModel: m as AppSettings['anthropicModel'] })}
                      onKeyChange={setAnthropicKey}
                      onSave={() => saveKey('anthropic', { anthropicKey: anthropicKey.trim(), providerType: 'anthropic' })}
                      saving={savingKey === 'anthropic'}
                      saved={savedKey === 'anthropic'}
                      placeholder="sk-ant-..."
                    />
                  )}

                  {settings.providerType === 'openrouter' && (
                    <CloudProviderForm
                      title="OpenRouter"
                      models={['meta-llama/llama-3.1-8b-instruct:free', 'google/gemma-3-12b-it:free']}
                      selectedModel={settings.openrouterModel}
                      apiKey={openrouterKey}
                      onModelChange={(m: string) => onUpdateSettings({ openrouterModel: m })}
                      onKeyChange={setOpenrouterKey}
                      onSave={() => saveKey('openrouter', { openrouterKey: openrouterKey.trim(), providerType: 'openrouter' })}
                      saving={savingKey === 'openrouter'}
                      saved={savedKey === 'openrouter'}
                      placeholder="sk-or-..."
                    />
                  )}

                  {settings.providerType === 'gemini' && (
                    <CloudProviderForm
                      title="Gemini"
                      models={['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro']}
                      selectedModel={settings.geminiModel}
                      apiKey={geminiKey}
                      onModelChange={(m: string) => onUpdateSettings({ geminiModel: m as AppSettings['geminiModel'] })}
                      onKeyChange={setGeminiKey}
                      onSave={() => saveKey('gemini', { geminiKey: geminiKey.trim(), providerType: 'gemini' })}
                      saving={savingKey === 'gemini'}
                      saved={savedKey === 'gemini'}
                      placeholder="AIza..."
                    />
                  )}

                  {settings.providerType === 'gemini-cli' && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-sm font-bold text-[rgb(var(--foreground))]">Gemini CLI</label>
                        <p className="text-xs text-[rgb(var(--muted-foreground))]">Uses the <code className="bg-[rgb(var(--muted))]/40 px-1 rounded">gemini</code> CLI installed on your system. No API key needed.</p>
                      </div>
                      <div className="rounded-xl bg-[rgb(var(--muted))]/20 border border-[rgb(var(--border))] px-4 py-3 text-xs text-[rgb(var(--muted-foreground))] font-mono">
                        gemini -p &quot;...&quot;
                      </div>
                      <p className="text-xs text-[rgb(var(--muted-foreground))]">Make sure <code className="bg-[rgb(var(--muted))]/40 px-1 rounded">gemini</code> is in your PATH and authenticated.</p>
                    </div>
                  )}

                  {settings.providerType === 'openai' && (
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <label className="text-sm font-bold text-[rgb(var(--foreground))]">OpenAI Compatible API</label>
                        <p className="text-xs text-[rgb(var(--muted-foreground))]">Connect to llama.cpp, vLLM, or local endpoints.</p>
                      </div>
                      <div className="space-y-4">
                        <div className="grid gap-4">
                          <LabeledInput label="Base URL" value={openaiBaseUrl} onChange={setOpenaiBaseUrl} placeholder="http://localhost:8081/v1" />
                          <LabeledInput label="Model Name" value={openaiModel} onChange={setOpenaiModel} placeholder="e.g. qwen-q4.gguf" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted-foreground))]">API Key (Optional)</label>
                          <div className="flex gap-2">
                            <Input
                              type="password"
                              value={openaiApiKey}
                              onChange={(e) => setOpenaiApiKey(e.target.value)}
                              placeholder="sk-..."
                              className="flex-1 bg-[rgb(var(--background))] border-[rgb(var(--border))] h-10"
                            />
                            <Button
                              onClick={() => saveKey('openai', { openaiBaseUrl: openaiBaseUrl.trim(), openaiModel: openaiModel.trim(), openaiApiKey: openaiApiKey.trim(), providerType: 'openai' })}
                              disabled={!openaiBaseUrl.trim() || savingKey === 'openai'}
                              className={cn('h-10 px-6 font-bold transition-all', savedKey === 'openai' && 'bg-emerald-600')}
                            >
                              {savingKey === 'openai' ? <Loader2 className="h-4 w-4 animate-spin" /> : savedKey === 'openai' ? <Check className="h-4 w-4" /> : 'Save'}
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-[rgb(var(--background))] border border-[rgb(var(--border))]">
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-[rgb(var(--foreground))]">Disable Tools</div>
                            <div className="text-[10px] text-[rgb(var(--muted-foreground))]">Stop sending MCP tool definitions to save context.</div>
                          </div>
                          <Switch checked={settings.openaiDisableTools} onClick={() => onUpdateSettings({ openaiDisableTools: !settings.openaiDisableTools })} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'email' && (
              <div className="space-y-8 animate-in slide-in-from-right-2 duration-300">
                <Section title="SMTP Configuration">
                  <p className="text-xs text-[rgb(var(--muted-foreground))] -mt-2 mb-2">
                    These credentials are used when xfile.ai sends emails on your behalf via the <code className="bg-[rgb(var(--muted))]/40 px-1 rounded text-xs">send_email_smtp</code> tool.
                  </p>
                  <div className="rounded-2xl bg-[rgb(var(--muted))]/20 border border-[rgb(var(--border))] p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <LabeledInput label="SMTP Host" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.gmail.com" />
                      <LabeledInput label="SMTP Port" value={smtpPort} onChange={setSmtpPort} placeholder="587" />
                    </div>
                    <LabeledInput label="Username / Email" value={smtpUser} onChange={setSmtpUser} placeholder="you@example.com" />
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted-foreground))]">Password / App Password</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showSmtpPass ? 'text' : 'password'}
                            value={smtpPass}
                            onChange={(e) => setSmtpPass(e.target.value)}
                            placeholder="••••••••••••"
                            className="bg-[rgb(var(--background))] border-[rgb(var(--border))] h-10 pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSmtpPass((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] transition-colors"
                          >
                            {showSmtpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <LabeledInput label="From Email" value={smtpFrom} onChange={setSmtpFrom} placeholder="you@example.com" />
                      <LabeledInput label="From Name" value={smtpFromName} onChange={setSmtpFromName} placeholder="Your Name" />
                    </div>
                    <div className="pt-1">
                      <Button
                        onClick={saveSmtp}
                        disabled={savingKey === 'smtp'}
                        className={cn('h-10 px-6 font-bold transition-all w-full', savedKey === 'smtp' && 'bg-emerald-600')}
                      >
                        {savingKey === 'smtp' ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
                        ) : savedKey === 'smtp' ? (
                          <><Check className="h-4 w-4 mr-2" />Saved</>
                        ) : 'Save SMTP Settings'}
                      </Button>
                    </div>
                  </div>
                </Section>

                <Section title="Quick-fill Presets">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Gmail', host: 'smtp.gmail.com', port: '587' },
                      { label: 'Outlook', host: 'smtp-mail.outlook.com', port: '587' },
                      { label: 'Zoho', host: 'smtp.zoho.com', port: '465' },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => { setSmtpHost(preset.host); setSmtpPort(preset.port) }}
                        className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20 px-3 py-2 text-xs font-semibold text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--muted))]/40 transition-all"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </Section>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-8 animate-in slide-in-from-right-2 duration-300">
                <Section title="Privacy & Compliance">
                  <div className="space-y-3">
                    <ToggleCard
                      label="Privacy Mode"
                      description="Hide filenames and sensitive metadata in the workspace UI."
                      checked={settings.privacyMode}
                      onChange={(checked) => onUpdateSettings({ privacyMode: checked })}
                    />
                    <ToggleCard
                      label="Analytics"
                      description="Share anonymous usage data to help us improve xfile.ai."
                      checked={settings.analyticsEnabled}
                      onChange={(checked) => onUpdateSettings({ analyticsEnabled: checked })}
                    />
                  </div>
                </Section>

                <Section title="Auto-Lock">
                  <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-[rgb(var(--muted))]/20 border border-[rgb(var(--border))]">
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-[rgb(var(--foreground))]">Inactivity Timeout</div>
                      <p className="text-xs text-[rgb(var(--muted-foreground))]">Lock the app after periods of idle time.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        value={settings.autoLockMinutes}
                        onChange={(e) => onUpdateSettings({ autoLockMinutes: parseInt(e.target.value) })}
                        className="w-16 h-9 bg-[rgb(var(--background))] border-[rgb(var(--border))] text-center font-bold"
                      />
                      <span className="text-[10px] font-bold text-[rgb(var(--muted-foreground))] uppercase">Min</span>
                    </div>
                  </div>
                </Section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-[rgb(var(--accent))]/10 text-[rgb(var(--foreground))]'
          : 'text-[rgb(var(--muted-foreground))] hover:bg-[rgb(var(--muted))]/30 hover:text-[rgb(var(--foreground))]',
      )}
    >
      <span className={cn('transition-colors', active ? 'text-[rgb(var(--accent))]' : 'text-[rgb(var(--muted-foreground))]')}>{icon}</span>
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-[rgb(var(--muted-foreground))]">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="space-y-0.5">
        <div className="text-sm font-semibold text-[rgb(var(--foreground))]">{label}</div>
        <div className="text-xs text-[rgb(var(--muted-foreground))] max-w-[320px] leading-relaxed">{description}</div>
      </div>
      {children}
    </div>
  )
}

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted-foreground))]">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[rgb(var(--background))] border-[rgb(var(--border))] h-10"
      />
    </div>
  )
}

function ToggleCard({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-[rgb(var(--muted))]/20 border border-[rgb(var(--border))] hover:bg-[rgb(var(--muted))]/30 transition-all">
      <div className="space-y-0.5">
        <div className="text-sm font-semibold text-[rgb(var(--foreground))]">{label}</div>
        <p className="text-xs text-[rgb(var(--muted-foreground))] max-w-[280px]">{description}</p>
      </div>
      <Switch checked={checked} onClick={() => onChange(!checked)} />
    </div>
  )
}

function CloudProviderForm({ title, models, selectedModel, apiKey, onModelChange, onKeyChange, onSave, saving, saved, placeholder }: {
  title: string; models: string[]; selectedModel: string; apiKey: string
  onModelChange: (m: string) => void; onKeyChange: (k: string) => void
  onSave: () => void; saving: boolean; saved: boolean; placeholder: string
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <label className="text-sm font-bold text-[rgb(var(--foreground))]">{title} Configuration</label>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">Premium cloud-based intelligence.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {models.map((m) => (
          <button
            key={m}
            onClick={() => onModelChange(m)}
            className={cn(
              'px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all',
              selectedModel === m
                ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 text-[rgb(var(--foreground))]'
                : 'border-[rgb(var(--border))] bg-[rgb(var(--background))] text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))]',
            )}
          >
            {m.split('-').slice(1).join(' ')}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted-foreground))]">API Key</label>
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-[rgb(var(--background))] border-[rgb(var(--border))] h-10"
          />
          <Button
            onClick={onSave}
            disabled={!apiKey.trim() || saving}
            className={cn('h-10 px-6 font-bold transition-all', saved && 'bg-emerald-600')}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
  )
}

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
  )
}
