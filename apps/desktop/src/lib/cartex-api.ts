/**
 * Cartex API Client for JiFile Desktop Integration
 * Handles all communication with the Cartex web service
 */

export interface CartexConfig {
  baseUrl: string;
  apiKey?: string;
  sessionToken?: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  version: string;
}

export interface ProviderConfig {
  id: string;
  provider: 'ANTHROPIC' | 'OPENAI' | 'GEMINI';
  label: string;
  isPrimary: boolean;
  rotationOrder: number;
}

export interface UserLimits {
  tokenAllowance: number;
  tokensRemaining: number;
  subscriptionName: string;
}

export interface ToolExecutionLog {
  toolName: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  inputData: any;
  outputData?: any;
  errorMessage?: string;
  executionTimeMs?: number;
  tokensUsed?: number;
  providerUsed?: string;
}

export interface DesktopConfig {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  device: {
    id: string;
    deviceId: string;
    name: string;
    isTrusted: boolean;
  } | null;
  subscription: {
    id: string;
    name: string;
    tokenAllowance: number;
    tokensRemaining: number;
  } | null;
  providers: {
    enabled: Record<string, ProviderConfig[]>;
    total: number;
    hasAnyEnabled: boolean;
  };
  features: {
    mcpTools: boolean;
    fileAccess: boolean;
    systemCommands: boolean;
    emailIntegration: boolean;
  };
  limits: {
    maxTokensPerRequest: number;
    maxConcurrentTools: number;
    rateLimitPerMinute: number;
  };
}

export class CartexAPIClient {
  private config: CartexConfig;
  private authHeaders: Record<string, string> = {};

  constructor(config: CartexConfig) {
    this.config = config;
    this.updateAuthHeaders();
  }

  private updateAuthHeaders() {
    this.authHeaders = {
      'Content-Type': 'application/json',
      'x-device-id': this.config.deviceId
    };

    if (this.config.sessionToken) {
      this.authHeaders['Authorization'] = `Bearer ${this.config.sessionToken}`;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.authHeaders,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Authentication Methods
  async registerDevice(): Promise<{
    device: any;
    sessionToken: string;
    expiresAt: string;
    requiresApproval?: boolean;
  }> {
    return this.request('/api/desktop/register', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: this.config.deviceId,
        name: this.config.deviceName,
        platform: this.config.platform,
        version: this.config.version
      })
    });
  }

  setSessionToken(token: string) {
    this.config.sessionToken = token;
    this.updateAuthHeaders();
  }

  // Configuration Methods
  async getDesktopConfig(): Promise<DesktopConfig> {
    return this.request('/api/desktop/config');
  }

  async updatePreferences(preferences: any): Promise<void> {
    return this.request('/api/desktop/config', {
      method: 'PATCH',
      body: JSON.stringify({ preferences })
    });
  }

  // Provider Methods
  async getEnabledProviders(): Promise<{
    providers: Record<string, ProviderConfig[]>;
    totalEnabled: number;
    userLimits: UserLimits | null;
  }> {
    return this.request('/api/desktop/providers');
  }

  async reportProviderUsage(data: {
    providerId: string;
    status: 'success' | 'error';
    latencyMs?: number;
    errorMessage?: string;
  }): Promise<void> {
    return this.request('/api/desktop/providers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Tool Execution Methods
  async logToolExecution(execution: ToolExecutionLog): Promise<{
    id: string;
    status: string;
    tokensUsed: number;
  }> {
    return this.request('/api/desktop/tools', {
      method: 'POST',
      body: JSON.stringify(execution)
    });
  }

  async getToolExecutionHistory(params: {
    limit?: number;
    offset?: number;
    tool?: string;
    device?: string;
  } = {}): Promise<{
    executions: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/api/desktop/tools?${queryString}` : '/api/desktop/tools';
    
    return this.request(endpoint);
  }

  // Utility Methods
  async healthCheck(): Promise<boolean> {
    try {
      await this.request('/api/desktop/config');
      return true;
    } catch {
      return false;
    }
  }

  async refreshConfig(): Promise<DesktopConfig> {
    const config = await this.getDesktopConfig();
    
    // Update local storage or electron store with new config
    if (typeof window !== 'undefined') {
      localStorage.setItem('cartex-config', JSON.stringify(config));
    }
    
    return config;
  }

  // Provider Selection Logic
  selectBestProvider(providerType: 'ANTHROPIC' | 'OPENAI' | 'GEMINI', providers: Record<string, ProviderConfig[]>): ProviderConfig | null {
    const typeProviders = providers[providerType] || [];
    
    if (typeProviders.length === 0) {
      return null;
    }

    // First try to get primary provider
    const primary = typeProviders.find(p => p.isPrimary);
    if (primary) {
      return primary;
    }

    // Fall back to first available provider by rotation order
    return typeProviders.sort((a, b) => a.rotationOrder - b.rotationOrder)[0];
  }
}

// Factory function for easy setup
export function createCartexClient(config: Partial<CartexConfig>): CartexAPIClient {
  const defaultConfig: CartexConfig = {
    baseUrl: process.env.CARTEX_API_URL || 'http://localhost:3001',
    deviceId: config.deviceId || generateDeviceId(),
    deviceName: config.deviceName || 'JiFile Desktop',
    platform: config.platform || process.platform,
    version: config.version || '1.0.0'
  };

  return new CartexAPIClient({ ...defaultConfig, ...config });
}

function generateDeviceId(): string {
  // Generate a unique device ID based on system info
  const crypto = require('crypto');
  const os = require('os');
  
  const machineInfo = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.userInfo().username
  ].join('-');
  
  return crypto.createHash('sha256').update(machineInfo).digest('hex').substring(0, 16);
}

// Export types for use in JiFile
export type {
  CartexConfig,
  ProviderConfig,
  UserLimits,
  ToolExecutionLog,
  DesktopConfig
};