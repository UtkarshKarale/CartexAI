/**
 * Cartex Authentication Integration for JiFile
 * Handles authentication with Cartex web service
 */

export interface CartexAuthConfig {
  baseUrl: string;
  clientId?: string;
  redirectUri?: string;
}

export interface CartexUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface CartexAuthResult {
  user: CartexUser;
  sessionToken: string;
  expiresAt: string;
}

export class CartexAuth {
  private config: CartexAuthConfig;
  private currentUser: CartexUser | null = null;
  private sessionToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(config: CartexAuthConfig) {
    this.config = config;
    this.loadStoredSession();
  }

  // Public Authentication Methods

  async loginWithEmail(email: string, password: string): Promise<CartexAuthResult> {
    const response = await fetch(`${this.config.baseUrl}/api/auth/signin/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.toLowerCase(),
        password,
        callbackUrl: this.config.redirectUri || '/dashboard'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Authentication failed' }));
      throw new Error(error.error || 'Login failed');
    }

    // For NextAuth, we need to handle the redirect-based auth
    // In a real implementation, you'd use the NextAuth API properly
    return this.handleAuthCallback(response);
  }

  async loginWithGoogle(): Promise<string> {
    // Return the Google OAuth URL for external browser
    return `${this.config.baseUrl}/api/auth/signin/google?callbackUrl=${encodeURIComponent(this.config.redirectUri || '/dashboard')}`;
  }

  async handleAuthCallback(response: Response): Promise<CartexAuthResult> {
    // Extract session information from the auth response
    const sessionCookie = response.headers.get('set-cookie');
    
    if (!sessionCookie) {
      throw new Error('No session cookie received');
    }

    // Extract session token from cookie
    const sessionMatch = sessionCookie.match(/next-auth\.session-token=([^;]+)/);
    const sessionToken = sessionMatch ? sessionMatch[1] : null;

    if (!sessionToken) {
      throw new Error('Invalid session token');
    }

    // Get user info using the session token
    const userResponse = await fetch(`${this.config.baseUrl}/api/auth/session`, {
      headers: {
        'Cookie': `next-auth.session-token=${sessionToken}`
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user session');
    }

    const session = await userResponse.json();
    
    if (!session?.user) {
      throw new Error('Invalid session data');
    }

    const user: CartexUser = {
      id: session.user.id,
      name: session.user.name || '',
      email: session.user.email || '',
      role: session.user.role || 'USER'
    };

    const result: CartexAuthResult = {
      user,
      sessionToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };

    this.setSession(result);
    return result;
  }

  async logout(): Promise<void> {
    try {
      if (this.sessionToken) {
        await fetch(`${this.config.baseUrl}/api/auth/signout`, {
          method: 'POST',
          headers: {
            'Cookie': `next-auth.session-token=${this.sessionToken}`
          }
        });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    }

    this.clearSession();
  }

  async refreshSession(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefreshSession();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  // Session Management

  isAuthenticated(): boolean {
    return !!(this.currentUser && this.sessionToken && !this.isSessionExpired());
  }

  getCurrentUser(): CartexUser | null {
    return this.currentUser;
  }

  getSessionToken(): string | null {
    return this.sessionToken;
  }

  onAuthStateChanged(callback: (user: CartexUser | null) => void): () => void {
    // Simple event system - in a real implementation you'd use EventEmitter
    const handler = () => callback(this.currentUser);
    
    // Store the callback for manual triggering
    const listeners = (this as any)._authListeners || ((this as any)._authListeners = []);
    listeners.push(handler);

    // Return unsubscribe function
    return () => {
      const index = listeners.indexOf(handler);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    };
  }

  // Private Methods

  private async doRefreshSession(): Promise<void> {
    if (!this.sessionToken) {
      throw new Error('No session to refresh');
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/auth/session`, {
        headers: {
          'Cookie': `next-auth.session-token=${this.sessionToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Session refresh failed');
      }

      const session = await response.json();
      
      if (!session?.user) {
        throw new Error('Invalid refreshed session');
      }

      // Update user info
      this.currentUser = {
        id: session.user.id,
        name: session.user.name || '',
        email: session.user.email || '',
        role: session.user.role || 'USER'
      };

      // Save updated session
      this.saveSession();
      this.notifyAuthStateChanged();

    } catch (error) {
      console.error('Session refresh failed:', error);
      this.clearSession();
      throw error;
    }
  }

  private setSession(result: CartexAuthResult): void {
    this.currentUser = result.user;
    this.sessionToken = result.sessionToken;
    this.saveSession();
    this.notifyAuthStateChanged();
  }

  private clearSession(): void {
    this.currentUser = null;
    this.sessionToken = null;
    this.clearStoredSession();
    this.notifyAuthStateChanged();
  }

  private isSessionExpired(): boolean {
    // For NextAuth sessions, we'll just check if they're still valid via API
    // In a real implementation, you'd check the actual expiry time
    return false; // Simplified for now
  }

  private saveSession(): void {
    if (typeof window !== 'undefined') {
      try {
        const sessionData = {
          user: this.currentUser,
          sessionToken: this.sessionToken,
          timestamp: Date.now()
        };
        localStorage.setItem('cartex-auth', JSON.stringify(sessionData));
      } catch (error) {
        console.error('Failed to save session:', error);
      }
    }
  }

  private loadStoredSession(): void {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('cartex-auth');
        if (stored) {
          const sessionData = JSON.parse(stored);
          
          // Check if session is recent (within 30 days)
          const age = Date.now() - (sessionData.timestamp || 0);
          const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
          
          if (age < maxAge) {
            this.currentUser = sessionData.user;
            this.sessionToken = sessionData.sessionToken;
            
            // Verify session is still valid in background
            this.refreshSession().catch(() => {
              this.clearSession();
            });
          }
        }
      } catch (error) {
        console.error('Failed to load stored session:', error);
        this.clearStoredSession();
      }
    }
  }

  private clearStoredSession(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('cartex-auth');
      } catch (error) {
        console.error('Failed to clear stored session:', error);
      }
    }
  }

  private notifyAuthStateChanged(): void {
    const listeners = (this as any)._authListeners || [];
    listeners.forEach((listener: (user: CartexUser | null) => void) => {
      try {
        listener(this.currentUser);
      } catch (error) {
        console.error('Auth state listener error:', error);
      }
    });
  }
}

// Singleton instance for app-wide use
let authInstance: CartexAuth | null = null;

export function getCartexAuth(config?: CartexAuthConfig): CartexAuth {
  if (!authInstance && config) {
    authInstance = new CartexAuth(config);
  }
  
  if (!authInstance) {
    throw new Error('CartexAuth not initialized. Call with config first.');
  }
  
  return authInstance;
}

// Helper hooks for React components
export function useCartexAuth() {
  const auth = getCartexAuth();
  
  return {
    user: auth.getCurrentUser(),
    isAuthenticated: auth.isAuthenticated(),
    sessionToken: auth.getSessionToken(),
    login: auth.loginWithEmail.bind(auth),
    loginWithGoogle: auth.loginWithGoogle.bind(auth),
    logout: auth.logout.bind(auth),
    refresh: auth.refreshSession.bind(auth)
  };
}