import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Card } from '../../components/ui/card'
import { ipcChannels } from '../../shared/ipc'

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

interface CartexAuthScreenProps {
  onAuthSuccess: (user: any) => void
  onSkip?: () => void
}

export function CartexAuthScreen({ onAuthSuccess, onSkip }: CartexAuthScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await window.electronAPI.invoke(ipcChannels.cartexLogin, email, password)
      
      if (result.success) {
        onAuthSuccess(result.user)
      } else {
        setError('Login failed. Please check your credentials.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 bg-slate-900 border-slate-800">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-600 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Connect to Cartex</h1>
          <p className="text-slate-400">
            Sign in to sync your AI providers and get centralized management
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="bg-slate-800 border-slate-700 text-white placeholder-slate-400"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-slate-800 border-slate-700 text-white placeholder-slate-400"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign in to Cartex'}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800">
          <div className="text-center">
            <p className="text-slate-400 text-sm mb-4">
              Don't have a Cartex account?
            </p>
            
            {onSkip && (
              <Button
                variant="outline"
                onClick={onSkip}
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                disabled={isLoading}
              >
                Skip for now (use local providers)
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800">
          <div className="text-center">
            <p className="text-xs text-slate-500">
              Cartex provides unified AI provider management,<br />
              smart routing, and usage tracking across providers.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}