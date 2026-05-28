/**
 * Cartex Configuration Sync for JiFile
 * Manages real-time sync of configuration between Cartex web and desktop
 */

import { CartexAPIClient, DesktopConfig } from './cartex-api';
import { getCartexAuth } from './cartex-auth';

export interface SyncOptions {
  syncInterval: number; // milliseconds
  retryDelay: number;
  maxRetries: number;
}

export interface ConfigUpdate {
  type: 'providers' | 'subscription' | 'features' | 'limits';
  data: any;
  timestamp: number;
}

export class CartexConfigSync {
  private client: CartexAPIClient;
  private config: DesktopConfig | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private listeners: ((config: DesktopConfig) => void)[] = [];
  private options: SyncOptions;

  constructor(client: CartexAPIClient, options: Partial<SyncOptions> = {}) {
    this.client = client;
    this.options = {
      syncInterval: 30000, // 30 seconds
      retryDelay: 5000,
      maxRetries: 3,
      ...options
    };
  }

  // Public Methods

  async start(): Promise<void> {
    if (this.isRunning) return;

    console.log('Starting Cartex config sync...');
    this.isRunning = true;

    // Initial sync
    await this.performSync();

    // Start periodic sync
    this.syncTimer = setInterval(() => {
      this.performSync().catch(error => {
        console.error('Periodic sync failed:', error);
      });
    }, this.options.syncInterval);

    console.log(`Config sync started (interval: ${this.options.syncInterval}ms)`);
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('Stopping Cartex config sync...');
    this.isRunning = false;

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async forceSync(): Promise<DesktopConfig> {
    return this.performSync();
  }

  getCurrentConfig(): DesktopConfig | null {
    return this.config;
  }

  onConfigUpdate(callback: (config: DesktopConfig) => void): () => void {
    this.listeners.push(callback);
    
    // If we have current config, call immediately
    if (this.config) {
      callback(this.config);
    }

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Configuration Getters with Caching

  getProviders(): Record<string, any[]> {
    return this.config?.providers.enabled || {};
  }

  getSubscriptionInfo(): any {
    return this.config?.subscription;
  }

  getFeatures(): any {
    return this.config?.features || {};
  }

  getLimits(): any {
    return this.config?.limits || {};
  }

  getUserInfo(): any {
    return this.config?.user;
  }

  getDeviceInfo(): any {
    return this.config?.device;
  }

  // Feature Checks

  isFeatureEnabled(feature: string): boolean {
    const features = this.getFeatures();
    return features[feature] === true;
  }

  hasTokensRemaining(): boolean {
    const subscription = this.getSubscriptionInfo();
    return subscription ? subscription.tokensRemaining > 0 : true;
  }

  isDeviceTrusted(): boolean {
    const device = this.getDeviceInfo();
    return device ? device.isTrusted : false;
  }

  canUseTool(toolName: string): boolean {
    if (!this.isDeviceTrusted()) {
      // Only allow basic tools for untrusted devices
      const allowedTools = ['list_files', 'read_file', 'search_files'];
      return allowedTools.includes(toolName);
    }

    // Trusted devices can use all tools based on subscription
    return this.hasTokensRemaining();
  }

  // Provider Selection

  selectBestProvider(type: 'ANTHROPIC' | 'OPENAI' | 'GEMINI'): any | null {
    return this.client.selectBestProvider(type, this.getProviders());
  }

  // Private Methods

  private async performSync(): Promise<DesktopConfig> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        const newConfig = await this.client.getDesktopConfig();
        
        // Check if config has actually changed
        const hasChanged = this.hasConfigChanged(newConfig);
        
        this.config = newConfig;
        
        if (hasChanged) {
          console.log('Config updated from Cartex', {
            providers: Object.keys(newConfig.providers.enabled).length,
            tokensRemaining: newConfig.subscription?.tokensRemaining,
            isTrusted: newConfig.device?.isTrusted
          });
          
          // Notify listeners of the update
          this.notifyListeners(newConfig);
          
          // Save to local storage for offline access
          this.saveToLocalStorage(newConfig);
        }

        return newConfig;

      } catch (error) {
        lastError = error as Error;
        console.error(`Sync attempt ${attempt} failed:`, error);

        if (attempt < this.options.maxRetries) {
          await this.delay(this.options.retryDelay * attempt);
        }
      }
    }

    // If all retries failed, try to load from local storage
    if (lastError && !this.config) {
      this.config = this.loadFromLocalStorage();
      if (this.config) {
        console.warn('Using cached config due to sync failure');
      }
    }

    if (lastError && !this.config) {
      throw lastError;
    }

    return this.config!;
  }

  private hasConfigChanged(newConfig: DesktopConfig): boolean {
    if (!this.config) return true;

    // Compare key aspects that would affect functionality
    const oldProviders = JSON.stringify(this.config.providers);
    const newProviders = JSON.stringify(newConfig.providers);
    
    const oldSubscription = JSON.stringify(this.config.subscription);
    const newSubscription = JSON.stringify(newConfig.subscription);
    
    const oldFeatures = JSON.stringify(this.config.features);
    const newFeatures = JSON.stringify(newConfig.features);

    return oldProviders !== newProviders || 
           oldSubscription !== newSubscription ||
           oldFeatures !== newFeatures;
  }

  private notifyListeners(config: DesktopConfig): void {
    this.listeners.forEach(listener => {
      try {
        listener(config);
      } catch (error) {
        console.error('Config listener error:', error);
      }
    });
  }

  private saveToLocalStorage(config: DesktopConfig): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('cartex-config-cache', JSON.stringify({
          config,
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Failed to save config to local storage:', error);
    }
  }

  private loadFromLocalStorage(): DesktopConfig | null {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('cartex-config-cache');
        if (stored) {
          const data = JSON.parse(stored);
          
          // Only use cached data if it's recent (within 1 hour)
          const age = Date.now() - data.timestamp;
          if (age < 60 * 60 * 1000) {
            return data.config;
          }
        }
      }
    } catch (error) {
      console.error('Failed to load config from local storage:', error);
    }
    
    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Factory function
export function createConfigSync(client: CartexAPIClient, options?: Partial<SyncOptions>): CartexConfigSync {
  return new CartexConfigSync(client, options);
}

// React hook for config sync
export function useCartexConfig(sync: CartexConfigSync) {
  const [config, setConfig] = React.useState<DesktopConfig | null>(sync.getCurrentConfig());

  React.useEffect(() => {
    return sync.onConfigUpdate(setConfig);
  }, [sync]);

  return {
    config,
    providers: sync.getProviders(),
    subscription: sync.getSubscriptionInfo(),
    features: sync.getFeatures(),
    limits: sync.getLimits(),
    user: sync.getUserInfo(),
    device: sync.getDeviceInfo(),
    isFeatureEnabled: sync.isFeatureEnabled.bind(sync),
    hasTokensRemaining: sync.hasTokensRemaining.bind(sync),
    isDeviceTrusted: sync.isDeviceTrusted.bind(sync),
    canUseTool: sync.canUseTool.bind(sync),
    selectBestProvider: sync.selectBestProvider.bind(sync),
    forceSync: sync.forceSync.bind(sync)
  };
}

// Note: Import React if using the hook
declare const React: any;