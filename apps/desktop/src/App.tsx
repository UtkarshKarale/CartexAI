import { useCallback, useEffect, useRef, useState } from 'react'
import { ToastProvider, useToast } from './components/ui/toast'
import { AuthScreen } from './features/auth/AuthScreen'
import { LockScreen } from './features/auth/LockScreen'
import { DesktopShell } from './features/layout/DesktopShell'
import { ProviderSetupScreen } from './features/setup/ProviderSetupScreen'
import type { AppRuntimeState, AppSettings, BootstrapPayload, CredentialKind, GemmaModelInfo, ModelSetupChunk, ProviderStatus, SystemInfo, ThemeMode } from './shared/contracts'
import { createDeviceId } from './lib/utils'

function initialRuntime(deviceId: string): AppRuntimeState {
  return {
    authMode: 'setup',
    user: null,
    session: null,
    device: {
      deviceId,
      platform: navigator.platform,
      trusted: false,
      rememberedAt: null,
      lastSeenAt: null,
    },
    currentConversationId: null,
    conversations: [],
    activity: [],
    workflows: [],
    settings: {
      theme: 'dark',
      autoLockMinutes: 5,
      privacyMode: true,
      analyticsEnabled: false,
      defaultModel: 'gemma3:1b',
      accent: 'slate',
      providerType: 'ollama',
      anthropicKey: '',
      anthropicModel: 'claude-haiku-4-5-20251001',
      openrouterKey: '',
      openrouterModel: 'meta-llama/llama-3.1-8b-instruct:free',
      geminiKey: '',
      geminiModel: 'gemini-2.0-flash',
      openaiBaseUrl: 'http://localhost:8081/v1',
      openaiApiKey: '',
      openaiModel: 'qwen-q4.gguf',
      openaiDisableTools: false,
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: '',
      smtpFromName: '',
    },
    messagesByConversation: {},
    toolExecutions: [],
    indexedFiles: [],
    permissions: [],
    memoryPreferences: [],
  }
}

function AppContent() {
  const { pushToast } = useToast()
  const compactWindow = new URLSearchParams(window.location.search).get('mode') === 'compact'
  const [bootstrapped, setBootstrapped] = useState(false)
  const [deviceId] = useState(() => createDeviceId())
  const [runtime, setRuntime] = useState<AppRuntimeState>(() => initialRuntime(deviceId))
  const [credentialKind, setCredentialKind] = useState<CredentialKind>('pin')
  const [displayName, setDisplayName] = useState('')
  const [credential, setCredential] = useState('')
  const [rememberDevice, setRememberDevice] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [modelSetup] = useState<ModelSetupChunk | null>(null)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [gemmaModels, setGemmaModels] = useState<GemmaModelInfo[]>([])
  const lockTimerRef = useRef<number | null>(null)

  const applyBootstrap = useCallback((payload: BootstrapPayload) => {
    setRuntime((current) => ({
      ...current,
      authMode: payload.authMode,
      user: payload.currentUser,
      session: payload.session,
      device: payload.device,
      conversations: payload.conversations,
      activity: payload.activity,
      workflows: payload.workflows,
      settings: payload.settings,
      toolExecutions: payload.toolExecutions,
      indexedFiles: payload.indexedFiles,
      permissions: payload.permissions,
      memoryPreferences: payload.memoryPreferences,
      currentConversationId: payload.conversations[0]?.id ?? null,
      messagesByConversation: current.messagesByConversation,
    }))
    setBootstrapped(true)
  }, [])

  useEffect(() => {
    const initialize = async () => {
      try {
        const payload = await window.desktopApi.bootstrap(deviceId)
        applyBootstrap(payload)
      } catch {
        setBootstrapped(true)
        pushToast({
          title: 'Backend unavailable',
          description: 'xfile.ai is running with the local shell only.',
          variant: 'warning',
        })
      }
    }

    initialize()
  }, [applyBootstrap, deviceId, pushToast])

  useEffect(() => {
    const resolvedTheme =
      runtime.settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : runtime.settings.theme

    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [runtime.settings.theme])

  useEffect(() => {
    document.documentElement.dataset.accent = runtime.settings.accent
  }, [runtime.settings.accent])

const handleLock = useCallback(async () => {
    if (!runtime.session?.id) {
      setRuntime((current) => ({ ...current, authMode: 'login' }))
      return
    }

    const payload = await window.desktopApi.lock(runtime.session.id)
    applyBootstrap(payload)
    setCredential('')
  }, [applyBootstrap, runtime.session?.id])

  useEffect(() => {
    if (runtime.authMode !== 'authenticated') {
      return
    }

    const schedule = () => {
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current)
      }

      lockTimerRef.current = window.setTimeout(() => {
        if (runtime.session?.id && runtime.settings.autoLockMinutes > 0) {
          void handleLock()
        }
      }, runtime.settings.autoLockMinutes * 60 * 1000)
    }

    schedule()

    const reset = () => schedule()
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }))

    return () => {
      if (lockTimerRef.current !== null) {
        window.clearTimeout(lockTimerRef.current)
      }
      events.forEach((event) => window.removeEventListener(event, reset))
    }
  }, [handleLock, runtime.authMode, runtime.session?.id, runtime.settings.autoLockMinutes])

  const handleCreateAccount = useCallback(async () => {
    if (!displayName.trim()) {
      setAuthError('Display name is required.')
      return
    }
    if (!validateCredential(credentialKind, credential)) {
      setAuthError(credentialKind === 'pin' ? 'Use a 4 to 12 digit PIN.' : 'Use a 10+ character password.')
      return
    }

    setBusy(true)
    setAuthError(null)
    try {
      const payload = await window.desktopApi.createAccount(
        {
          displayName: displayName.trim(),
          credential: credential.trim(),
          rememberDevice,
          credentialKind,
        },
        deviceId,
      )
      applyBootstrap(payload)
      pushToast({
        title: 'Account created',
        description: 'xfile.ai is ready on this device.',
        variant: 'success',
      })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create the account.')
    } finally {
      setBusy(false)
    }
  }, [applyBootstrap, credential, credentialKind, deviceId, displayName, pushToast, rememberDevice])

  const handleLogin = useCallback(async () => {
    if (!validateCredential(credentialKind, credential)) {
      setAuthError(credentialKind === 'pin' ? 'Enter your PIN.' : 'Enter your password.')
      return
    }

    setBusy(true)
    setAuthError(null)
    try {
      const payload = await window.desktopApi.login(
        {
          credential: credential.trim(),
          rememberDevice,
          credentialKind,
        },
        deviceId,
      )
      applyBootstrap(payload)
      pushToast({
        title: 'Unlocked',
        description: `${payload.currentUser?.displayName ?? 'xfile.ai'} is active.`,
        variant: 'success',
      })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }, [applyBootstrap, credential, credentialKind, deviceId, pushToast, rememberDevice])

  const handleUnlock = useCallback(async () => {
    if (!credential.trim()) {
      setAuthError('Enter your credential to unlock.')
      return
    }

    setBusy(true)
    setAuthError(null)
    try {
      const payload = await window.desktopApi.unlock(credential.trim(), deviceId)
      applyBootstrap(payload)
      pushToast({
        title: 'Session restored',
        description: 'xfile.ai is active again.',
        variant: 'success',
      })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to unlock the session.')
    } finally {
      setBusy(false)
    }
  }, [applyBootstrap, credential, deviceId, pushToast])

  const handleLogout = useCallback(async () => {
    if (!runtime.session?.id) {
      return
    }

    const payload = await window.desktopApi.logout(runtime.session.id)
    applyBootstrap(payload)
    setCredential('')
  }, [applyBootstrap, runtime.session?.id])

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!runtime.currentConversationId) {
        return
      }

      const tempMsg = {
        id: `temp-${Date.now()}`,
        role: 'user' as const,
        content,
        createdAt: new Date().toISOString(),
        conversationId: runtime.currentConversationId,
        metadata: {} as Record<string, unknown>,
      }
      setRuntime((current) => ({
        ...current,
        messagesByConversation: {
          ...current.messagesByConversation,
          [runtime.currentConversationId!]: [
            ...(current.messagesByConversation[runtime.currentConversationId!] ?? []),
            tempMsg,
          ],
        },
      }))

      const nextMessages = await window.desktopApi.sendMessage({
        conversationId: runtime.currentConversationId,
        content,
      })

      setRuntime((current) => ({
        ...current,
        messagesByConversation: {
          ...current.messagesByConversation,
          [runtime.currentConversationId!]: nextMessages,
        },
      }))
    },
    [runtime.currentConversationId],
  )

  const handleClearConversation = useCallback(
    async (id: string) => {
      await window.desktopApi.clearConversation(id)
      setRuntime((current) => ({
        ...current,
        conversations: current.conversations.map((c) =>
          c.id === id ? { ...c, preview: '', messageCount: 0 } : c,
        ),
        messagesByConversation: {
          ...current.messagesByConversation,
          [id]: [],
        },
      }))
    },
    [],
  )

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await window.desktopApi.deleteConversation(id)
      setRuntime((current) => {
        const nextConversations = current.conversations.filter((c) => c.id !== id)
        const nextCurrentId =
          current.currentConversationId === id
            ? nextConversations[0]?.id ?? null
            : current.currentConversationId

        const nextMessages = { ...current.messagesByConversation }
        delete nextMessages[id]

        return {
          ...current,
          conversations: nextConversations,
          currentConversationId: nextCurrentId,
          messagesByConversation: nextMessages,
        }
      })
    },
    [],
  )

  const refreshProviderStatus = useCallback(async () => {
    try {
      const [status, info, models] = await Promise.all([
        window.desktopApi.detectProviders(),
        window.desktopApi.getSystemInfo(),
        window.desktopApi.listGemmaModels().catch(() => []),
      ])
      setProviderStatus(status)
      setSystemInfo(info)
      setGemmaModels(models)
    } catch {
      // provider detection is best-effort
    }
  }, [])

  useEffect(() => {
    if (runtime.authMode === 'authenticated') {
      void refreshProviderStatus()
    }
  }, [runtime.authMode, refreshProviderStatus])

  const handleSaveAnthropicKey = useCallback(async (key: string) => {
    const nextSettings = await window.desktopApi.updateSettings({
      anthropicKey: key,
      providerType: 'anthropic',
    })
    setRuntime((current) => ({ ...current, settings: nextSettings }))
    await refreshProviderStatus()
  }, [refreshProviderStatus])

  const handleSaveOpenrouterKey = useCallback(async (key: string) => {
    const nextSettings = await window.desktopApi.updateSettings({
      openrouterKey: key,
      providerType: 'openrouter',
    })
    setRuntime((current) => ({ ...current, settings: nextSettings }))
    await refreshProviderStatus()
  }, [refreshProviderStatus])

  const handleSaveGeminiKey = useCallback(async (key: string) => {
    const nextSettings = await window.desktopApi.updateSettings({
      geminiKey: key,
      providerType: 'gemini',
    })
    setRuntime((current) => ({ ...current, settings: nextSettings }))
    await refreshProviderStatus()
  }, [refreshProviderStatus])

  const handleSelectConversation = useCallback(async (id: string) => {
    setRuntime((current) => ({ ...current, currentConversationId: id }))
    if (!runtime.messagesByConversation[id]) {
      try {
        const msgs = await window.desktopApi.listMessages(id)
        setRuntime((current) => ({
          ...current,
          messagesByConversation: { ...current.messagesByConversation, [id]: msgs },
        }))
      } catch {
        // best-effort
      }
    }
  }, [runtime.messagesByConversation])

  const handleCreateConversation = useCallback(async () => {
    const conversation = await window.desktopApi.createConversation({
      title: `Conversation ${runtime.conversations.length + 1}`,
      tags: ['local'],
    })

    setRuntime((current) => ({
      ...current,
      conversations: [conversation, ...current.conversations],
      currentConversationId: conversation.id,
      messagesByConversation: {
        ...current.messagesByConversation,
        [conversation.id]: [],
      },
    }))
  }, [runtime.conversations.length])

  const handleUpdateTheme = useCallback(async (nextTheme: ThemeMode) => {
    const nextSettings = await window.desktopApi.updateSettings({ theme: nextTheme })
    setRuntime((current) => ({
      ...current,
      settings: nextSettings,
    }))
  }, [])

  const handleUpdateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    const nextSettings = await window.desktopApi.updateSettings(updates)
    setRuntime((current) => ({
      ...current,
      settings: nextSettings,
    }))
  }, [])

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[rgb(var(--background))] text-[rgb(var(--foreground))]">
        Loading xfile.ai...
      </div>
    )
  }

  if (runtime.authMode === 'setup' || runtime.authMode === 'login') {
    return (
      <AuthScreen
        mode={runtime.authMode === 'setup' ? 'setup' : 'login'}
        credentialKind={credentialKind}
        displayName={displayName}
        credential={credential}
        rememberDevice={rememberDevice}
        error={authError}
        submitting={busy}
        onDisplayNameChange={setDisplayName}
        onCredentialChange={setCredential}
        onRememberDeviceChange={setRememberDevice}
        onCredentialKindChange={setCredentialKind}
        onSubmit={runtime.authMode === 'setup' ? handleCreateAccount : handleLogin}
      />
    )
  }

  const hasAnyProvider = providerStatus
    ? providerStatus.ollama || providerStatus.dockerOllama || Boolean(providerStatus.anthropicKey) || Boolean(providerStatus.openrouterKey) || Boolean(providerStatus.geminiKey)
    : true  // don't block render until first detection completes

  if (runtime.authMode === 'authenticated' && !hasAnyProvider && providerStatus && systemInfo) {
    return (
      <ProviderSetupScreen
        systemInfo={systemInfo}
        providerStatus={providerStatus}
        onSaveAnthropicKey={handleSaveAnthropicKey}
        onSaveOpenrouterKey={handleSaveOpenrouterKey}
        onSaveGeminiKey={handleSaveGeminiKey}
        onRefresh={refreshProviderStatus}
      />
    )
  }

  return (
    <div className="relative min-h-screen">
      <DesktopShell
        user={runtime.user}
        sessionActive={runtime.authMode === 'authenticated'}
        conversations={runtime.conversations}
        selectedConversationId={runtime.currentConversationId}
        messages={runtime.currentConversationId ? runtime.messagesByConversation[runtime.currentConversationId] ?? [] : []}
        settings={runtime.settings}
        theme={runtime.settings.theme}
        modelSetup={modelSetup}
        gemmaModels={gemmaModels}
        onRefreshModels={refreshProviderStatus}
        onSelectConversation={handleSelectConversation}
        onCreateConversation={handleCreateConversation}
        onSendMessage={handleSendMessage}
        onClearConversation={handleClearConversation}
        onDeleteConversation={handleDeleteConversation}
        onUpdateTheme={handleUpdateTheme}
        onUpdateSettings={handleUpdateSettings}
        onLock={() => void handleLock()}
        onLogout={() => void handleLogout()}
        compact={compactWindow}
        onOpenCompactWindow={() => void window.desktopApi.showCompactWindow()}
        onOpenMainWindow={() => void window.desktopApi.showMainWindow()}
      />

      {runtime.authMode === 'locked' ? (
        <LockScreen
          credentialKind={credentialKind}
          credential={credential}
          error={authError}
          onCredentialChange={setCredential}
          onUnlock={handleUnlock}
        />
      ) : null}

    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

function validateCredential(kind: CredentialKind, value: string) {
  const trimmed = value.trim()
  if (kind === 'pin') {
    return /^\d{4,12}$/.test(trimmed)
  }
  return trimmed.length >= 10
}
