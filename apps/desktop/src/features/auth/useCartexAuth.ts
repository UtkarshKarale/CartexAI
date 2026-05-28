import { useState, useEffect, useCallback } from 'react'
import { ipcChannels } from '../../shared/ipc'

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

interface CartexUser {
  id: string
  name: string
  email: string
  role: string
}

interface CartexAuthState {
  isAuthenticated: boolean
  user: CartexUser | null
  deviceStatus: {
    isTrusted: boolean
    deviceId: string
  } | null
  isLoading: boolean
  error: string | null
}

interface CartexConfig {
  providers: {
    enabled: Record<string, any[]>
    hasAnyEnabled: boolean
  }
  subscription: {
    name: string
    tokensRemaining: number
    tokenAllowance: number
  }
  device: {
    isTrusted: boolean
    deviceId: string
  }
  features: Record<string, boolean>
}

export function useCartexAuth() {
  const [state, setState] = useState<CartexAuthState>({
    isAuthenticated: false,
    user: null,
    deviceStatus: null,
    isLoading: true,
    error: null
  })
  
  const [config, setConfig] = useState<CartexConfig | null>(null)

  const checkAuthStatus = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }))
      
      const deviceStatus = await window.electronAPI.invoke(ipcChannels.cartexDeviceStatus)
      
      setState({
        isAuthenticated: deviceStatus.isAuthenticated,
        user: deviceStatus.user,
        deviceStatus: {
          isTrusted: deviceStatus.isTrusted,
          deviceId: deviceStatus.deviceId
        },
        isLoading: false,
        error: null
      })

      // Load config if authenticated
      if (deviceStatus.isAuthenticated) {
        try {
          const configData = await window.electronAPI.invoke(ipcChannels.cartexConfig)
          setConfig(configData)
        } catch (configError) {
          console.warn('Failed to load Cartex config:', configError)
        }
      }
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to check auth status'
      }))
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }))
      
      const result = await window.electronAPI.invoke(ipcChannels.cartexLogin, email, password)
      
      if (result.success) {
        await checkAuthStatus() // Refresh status after login
        return result
      } else {
        throw new Error('Login failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }))
      throw new Error(errorMessage)
    }
  }, [checkAuthStatus])

  const logout = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }))
      
      await window.electronAPI.invoke(ipcChannels.cartexLogout)
      
      setState({
        isAuthenticated: false,
        user: null,
        deviceStatus: null,
        isLoading: false,
        error: null
      })
      setConfig(null)
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed'
      }))
    }
  }, [])

  const syncConfig = useCallback(async () => {
    if (!state.isAuthenticated) return
    
    try {
      await window.electronAPI.invoke(ipcChannels.cartexSyncConfig)
      await checkAuthStatus() // Refresh after sync
    } catch (error) {
      console.error('Config sync failed:', error)
    }
  }, [state.isAuthenticated, checkAuthStatus])

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus()
  }, [checkAuthStatus])

  // Auto-sync config every 30 seconds if authenticated
  useEffect(() => {
    if (!state.isAuthenticated) return

    const interval = setInterval(syncConfig, 30000)
    return () => clearInterval(interval)
  }, [state.isAuthenticated, syncConfig])

  return {
    ...state,
    config,
    login,
    logout,
    syncConfig,
    refresh: checkAuthStatus,
    
    // Computed values
    hasTokensRemaining: config ? config.subscription?.tokensRemaining > 0 : true,
    isDeviceTrusted: state.deviceStatus?.isTrusted || false,
    providerCount: config ? Object.values(config.providers?.enabled || {}).reduce((acc, arr) => acc + arr.length, 0) : 0,
    
    // Helper methods
    canUseTool: (toolName: string) => {
      if (!state.deviceStatus?.isTrusted) {
        const allowedTools = ['list_files', 'read_file', 'search_files']
        return allowedTools.includes(toolName)
      }
      return config ? config.subscription?.tokensRemaining > 0 : true
    },
    
    isFeatureEnabled: (feature: string) => {
      return config?.features?.[feature] === true
    }
  }
}