/**
 * Cartex Provider Integration for JiFile
 * Routes AI requests through Cartex provider management system
 */

import type { AiMessage, AiProvider, AiResponse, AiToolSchema } from '../ai/providers/base';
import { CartexAPIClient, ProviderConfig, DesktopConfig } from './cartex-api';

export interface CartexProviderOptions {
  client: CartexAPIClient;
  fallbackToLocal?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export class CartexProvider implements AiProvider {
  private client: CartexAPIClient;
  private config: DesktopConfig | null = null;
  private fallbackToLocal: boolean;
  private maxRetries: number;
  private retryDelay: number;

  constructor(options: CartexProviderOptions) {
    this.client = options.client;
    this.fallbackToLocal = options.fallbackToLocal ?? true;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
  }

  async initialize(): Promise<void> {
    try {
      this.config = await this.client.getDesktopConfig();
      console.log('Cartex provider initialized', {
        hasProviders: this.config.providers.hasAnyEnabled,
        tokensRemaining: this.config.subscription?.tokensRemaining,
        features: this.config.features
      });
    } catch (error) {
      console.error('Failed to initialize Cartex provider:', error);
      throw error;
    }
  }

  async chat(messages: AiMessage[], tools: AiToolSchema[] = []): Promise<AiResponse> {
    if (!this.config) {
      await this.initialize();
    }

    // Check token limits
    if (!this.hasTokensAvailable()) {
      throw new Error('Token limit exceeded. Please upgrade your subscription.');
    }

    // Select best provider
    const provider = this.selectProvider();
    if (!provider) {
      if (this.fallbackToLocal) {
        return this.fallbackToLocalProvider(messages, tools);
      }
      throw new Error('No AI providers available');
    }

    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        // Log tool execution start
        const executionId = await this.logToolExecutionStart({
          toolName: 'ai_chat',
          inputData: { 
            messageCount: messages.length,
            hasTools: tools.length > 0,
            provider: provider.provider
          }
        });

        // Make AI request through Cartex
        const response = await this.makeAIRequest(messages, tools, provider);
        const executionTime = Date.now() - startTime;

        // Log successful execution
        await this.logToolExecutionComplete(executionId, {
          status: 'COMPLETED',
          outputData: { 
            responseLength: response.content.length,
            toolCalls: response.toolCalls.length
          },
          executionTimeMs: executionTime,
          tokensUsed: response.usage?.inputTokens + response.usage?.outputTokens || 0,
          providerUsed: provider.provider
        });

        // Report provider success
        await this.client.reportProviderUsage({
          providerId: provider.id,
          status: 'success',
          latencyMs: executionTime
        });

        return response;

      } catch (error) {
        attempt++;
        const isLastAttempt = attempt >= this.maxRetries;

        // Log failed execution
        await this.logToolExecutionError({
          toolName: 'ai_chat',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          executionTimeMs: Date.now() - startTime,
          providerUsed: provider.provider
        });

        // Report provider error
        await this.client.reportProviderUsage({
          providerId: provider.id,
          status: 'error',
          latencyMs: Date.now() - startTime,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });

        if (isLastAttempt) {
          if (this.fallbackToLocal) {
            console.warn('All Cartex providers failed, falling back to local');
            return this.fallbackToLocalProvider(messages, tools);
          }
          throw error;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
      }
    }

    throw new Error('All retry attempts exhausted');
  }

  async stream(messages: AiMessage[], onChunk: (text: string) => void): Promise<void> {
    // For now, use regular chat and stream the complete response
    // In a full implementation, you'd implement proper streaming
    try {
      const response = await this.chat(messages);
      
      // Simulate streaming by chunking the response
      const words = response.content.split(' ');
      for (let i = 0; i < words.length; i++) {
        onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate typing
      }
    } catch (error) {
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await this.client.healthCheck();
    } catch {
      return false;
    }
  }

  // Private Methods

  private hasTokensAvailable(): boolean {
    if (!this.config?.subscription) return true; // No subscription limits
    return this.config.subscription.tokensRemaining > 100; // Keep 100 token buffer
  }

  private selectProvider(): ProviderConfig | null {
    if (!this.config?.providers.enabled) return null;

    // Try providers in order of preference
    const providerTypes: ('ANTHROPIC' | 'OPENAI' | 'GEMINI')[] = ['ANTHROPIC', 'OPENAI', 'GEMINI'];
    
    for (const type of providerTypes) {
      const provider = this.client.selectBestProvider(type, this.config.providers.enabled);
      if (provider) return provider;
    }

    return null;
  }

  private async makeAIRequest(
    messages: AiMessage[], 
    tools: AiToolSchema[], 
    provider: ProviderConfig
  ): Promise<AiResponse> {
    // This would integrate with the actual Cartex AI endpoint
    // For now, we'll simulate the request structure
    
    const requestBody = {
      provider: provider.provider,
      providerId: provider.id,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      tools: tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      })),
      stream: false
    };

    // This endpoint would need to be created in Cartex
    const response = await fetch(`${this.client['config'].baseUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.client['config'].sessionToken}`,
        'x-device-id': this.client['config'].deviceId
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      content: data.content || '',
      toolCalls: data.toolCalls || [],
      usage: data.usage ? {
        inputTokens: data.usage.inputTokens || 0,
        outputTokens: data.usage.outputTokens || 0,
        cacheCreationTokens: data.usage.cacheCreationTokens || 0,
        cacheReadTokens: data.usage.cacheReadTokens || 0
      } : undefined
    };
  }

  private async fallbackToLocalProvider(messages: AiMessage[], tools: AiToolSchema[]): Promise<AiResponse> {
    // Fallback to local Ollama or other local provider
    console.log('Using local fallback provider');
    
    return {
      content: 'I apologize, but the AI service is currently unavailable. Please try again later.',
      toolCalls: [],
      usage: {
        inputTokens: 0,
        outputTokens: 20,
        cacheCreationTokens: 0,
        cacheReadTokens: 0
      }
    };
  }

  private async logToolExecutionStart(data: {
    toolName: string;
    inputData: any;
  }): Promise<string> {
    try {
      const result = await this.client.logToolExecution({
        ...data,
        status: 'RUNNING'
      });
      return result.id;
    } catch (error) {
      console.error('Failed to log tool execution start:', error);
      return 'unknown';
    }
  }

  private async logToolExecutionComplete(executionId: string, data: {
    status: 'COMPLETED' | 'FAILED';
    outputData?: any;
    executionTimeMs: number;
    tokensUsed: number;
    providerUsed: string;
  }): Promise<void> {
    try {
      await this.client.logToolExecution({
        toolName: 'ai_chat',
        inputData: {},
        ...data
      });
    } catch (error) {
      console.error('Failed to log tool execution completion:', error);
    }
  }

  private async logToolExecutionError(data: {
    toolName: string;
    errorMessage: string;
    executionTimeMs: number;
    providerUsed: string;
  }): Promise<void> {
    try {
      await this.client.logToolExecution({
        ...data,
        status: 'FAILED',
        inputData: {}
      });
    } catch (error) {
      console.error('Failed to log tool execution error:', error);
    }
  }

  // Configuration refresh
  async refreshConfig(): Promise<void> {
    this.config = await this.client.refreshConfig();
  }
}