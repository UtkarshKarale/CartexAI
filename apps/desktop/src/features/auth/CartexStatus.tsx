import { useState, useEffect } from 'react'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { ipcChannels } from '../../shared/ipc'

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

interface CartexStatusProps {
  onDisconnect?: () => void
  onRefresh?: () => void
}

interface DeviceStatus {
  isTrusted: boolean
  deviceId: string
  isAuthenticated: boolean
  user: {
    name: string
    email: string
    role: string
  }
}

interface ProviderStatus {
  ANTHROPIC?: any[]
  OPENAI?: any[]
  GEMINI?: any[]
}

export function CartexStatus({ onDisconnect, onRefresh }: CartexStatusProps) {
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null)
  const [providers, setProviders] = useState<ProviderStatus>({})
  const [config, setConfig] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadCartexStatus = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [statusResult, providersResult, configResult] = await Promise.all([
        window.electronAPI.invoke(ipcChannels.cartexDeviceStatus),
        window.electronAPI.invoke(ipcChannels.cartexProviders),
        window.electronAPI.invoke(ipcChannels.cartexConfig)
      ])

      setDeviceStatus(statusResult)
      setProviders(providersResult)
      setConfig(configResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Cartex status')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForceSync = async () => {
    try {
      setIsLoading(true)
      await window.electronAPI.invoke(ipcChannels.cartexSyncConfig)
      await loadCartexStatus()
      onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync configuration')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.invoke(ipcChannels.cartexLogout)
      onDisconnect?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  useEffect(() => {
    loadCartexStatus()
  }, [])

  if (isLoading && !deviceStatus) {
    return (
      <Card className="p-6 bg-slate-900 border-slate-800">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-700 rounded w-1/4 mb-4"></div>
          <div className="h-3 bg-slate-700 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-slate-700 rounded w-3/4"></div>
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-6 bg-slate-900 border-slate-800">
        <div className="text-center">
          <div className="text-red-400 mb-2">⚠️ Connection Error</div>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <Button 
            onClick={loadCartexStatus}
            size="sm"
            variant="outline"
            className="border-slate-700"
          >
            Retry
          </Button>
        </div>
      </Card>
    )
  }

  if (!deviceStatus?.isAuthenticated) {
    return (
      <Card className="p-6 bg-slate-900 border-slate-800">
        <div className="text-center">
          <div className="text-slate-400 mb-2">🔌 Not Connected</div>
          <p className="text-slate-500 text-sm">Cartex integration not active</p>
        </div>
      </Card>
    )
  }

  const providerCount = Object.values(providers).reduce((acc, arr) => acc + (arr?.length || 0), 0)
  const trustStatus = deviceStatus.isTrusted ? 'Trusted' : 'Pending Approval'
  const trustColor = deviceStatus.isTrusted ? 'bg-green-500' : 'bg-yellow-500'

  return (
    <Card className="p-6 bg-slate-900 border-slate-800">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Cartex Connected</h3>
          <p className="text-slate-400 text-sm">{deviceStatus.user.email}</p>
        </div>
        <Badge className={`${trustColor} text-white`}>
          {trustStatus}
        </Badge>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-slate-300 text-sm">Device</span>
          <span className="text-slate-400 text-sm font-mono">{deviceStatus.deviceId?.slice(-8) || 'Unknown'}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-300 text-sm">AI Providers</span>
          <span className="text-slate-400 text-sm">{providerCount} enabled</span>
        </div>

        {config?.subscription && (
          <div className="flex items-center justify-between">
            <span className="text-slate-300 text-sm">Tokens Remaining</span>
            <span className="text-slate-400 text-sm">
              {config.subscription.tokensRemaining?.toLocaleString() || '0'}
            </span>
          </div>
        )}

        {config?.subscription && (
          <div className="flex items-center justify-between">
            <span className="text-slate-300 text-sm">Plan</span>
            <Badge variant="outline" className="text-xs">
              {config.subscription.name || 'Unknown'}
            </Badge>
          </div>
        )}
      </div>

      {!deviceStatus.isTrusted && (
        <div className="p-3 bg-yellow-900/30 border border-yellow-800 rounded-lg mb-4">
          <p className="text-yellow-300 text-xs">
            ⏳ Device pending admin approval. Some features may be limited until your device is trusted.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleForceSync}
          size="sm"
          variant="outline"
          className="border-slate-700 text-slate-300"
          disabled={isLoading}
        >
          {isLoading ? 'Syncing...' : 'Sync'}
        </Button>
        
        <Button
          onClick={handleDisconnect}
          size="sm"
          variant="outline"
          className="border-red-800 text-red-300 hover:bg-red-900/30"
        >
          Disconnect
        </Button>
      </div>

      {config && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <details className="text-xs">
            <summary className="text-slate-400 cursor-pointer">Provider Details</summary>
            <div className="mt-2 space-y-1">
              {Object.entries(providers).map(([provider, configs]) => (
                <div key={provider} className="flex items-center justify-between">
                  <span className="text-slate-500">{provider}</span>
                  <span className="text-slate-400">{configs?.length || 0} keys</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </Card>
  )
}