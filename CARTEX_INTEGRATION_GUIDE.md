# JiFile + Cartex Integration Guide

## 🎯 Overview
This guide shows how to integrate JiFile desktop with the Cartex AI provider management system using pure API-based communication (no database required).

## 🔧 Integration Architecture

```
┌─────────────────┐    HTTP APIs    ┌─────────────────┐
│   JiFile        │◄───────────────►│   Cartex Web    │
│   Desktop       │                 │   Service       │
│                 │                 │                 │
│ • Pure Client   │                 │ • Auth & Users  │
│ • No Database   │                 │ • Providers     │
│ • API-Based     │                 │ • Subscriptions │
│ • Real-time     │                 │ • Usage Logs    │
└─────────────────┘                 └─────────────────┘
        │                                    │
        │                                    │
        ▼                                    ▼
┌─────────────────┐                 ┌─────────────────┐
│   MCP Server    │                 │   PostgreSQL    │
│                 │                 │   Database      │
│ • Tool Registry │                 │                 │
│ • File Ops      │                 │ • All Data      │
│ • System Cmds   │                 │ • Provider Keys │
└─────────────────┘                 └─────────────────┘
```

## 📁 New Files Created

### API Integration Layer
- `src/lib/cartex-api.ts` - API client for Cartex communication
- `src/lib/cartex-auth.ts` - Authentication integration
- `src/lib/cartex-sync.ts` - Configuration synchronization
- `src/lib/cartex-provider.ts` - AI provider routing through Cartex
- `electron/ai/cartex-orchestrator.ts` - Updated orchestrator with Cartex integration

## 🚀 Integration Steps

### 1. Install Dependencies

```bash
cd apps/desktop
npm install
```

### 2. Environment Configuration

Create `.env` in the desktop app root:

```env
# Cartex API Configuration
CARTEX_API_URL=http://localhost:3001
CARTEX_CLIENT_ID=jifile-desktop
APP_VERSION=1.0.0

# Device Configuration
DEVICE_NAME=JiFile Desktop
PLATFORM=auto

# Features
ENABLE_CARTEX_INTEGRATION=true
FALLBACK_TO_LOCAL=true
```

### 3. Update Main Process

Replace the current orchestrator initialization in `electron/main.ts`:

```typescript
import { CartexAiOrchestrator } from './ai/cartex-orchestrator'
import { createCartexClient } from '../src/lib/cartex-api'

// Initialize Cartex integration
const cartexOrchestrator = new CartexAiOrchestrator(
  fallbackProvider, // Your existing local provider
  onChunk,
  settings
)

// Initialize on startup
await cartexOrchestrator.initialize()
```

### 4. Update IPC Handlers

Add new IPC handlers for Cartex integration:

```typescript
// In preload.ts or main.ts
ipcMain.handle('cartex:login', async (_, email: string, password: string) => {
  const auth = getCartexAuth()
  return await auth.loginWithEmail(email, password)
})

ipcMain.handle('cartex:config', async () => {
  const client = getCartexClient()
  return await client.getDesktopConfig()
})

ipcMain.handle('cartex:providers', async () => {
  const client = getCartexClient()
  return await client.getEnabledProviders()
})
```

### 5. Update UI Components

#### Authentication Screen
```typescript
import { useCartexAuth } from '../lib/cartex-auth'

export function AuthScreen() {
  const { login, isAuthenticated, user } = useCartexAuth()
  
  const handleLogin = async (email: string, password: string) => {
    try {
      await login(email, password)
      // Redirect to main app
    } catch (error) {
      // Handle login error
    }
  }
  
  // Render login form
}
```

#### Settings Panel
```typescript
import { useCartexConfig } from '../lib/cartex-sync'

export function SettingsPanel() {
  const {
    config,
    providers,
    subscription,
    isDeviceTrusted,
    hasTokensRemaining
  } = useCartexConfig(configSync)
  
  // Render provider status, subscription info, etc.
}
```

## 🔑 Authentication Flow

### 1. Device Registration
```typescript
// Automatic on first run
const client = createCartexClient({
  baseUrl: 'http://localhost:3001',
  deviceName: 'JiFile Desktop - MacBook',
  platform: 'darwin'
})

const registration = await client.registerDevice()
// Device gets session token and trust status
```

### 2. User Login
```typescript
// User logs in via web browser or embedded auth
const auth = getCartexAuth({
  baseUrl: 'http://localhost:3001'
})

const result = await auth.loginWithEmail(email, password)
// Gets user info and session token
```

### 3. Configuration Sync
```typescript
// Real-time config sync
const sync = createConfigSync(client, { syncInterval: 30000 })
await sync.start()

sync.onConfigUpdate((config) => {
  // Update UI with new provider status, subscription info, etc.
})
```

## 🤖 AI Request Flow

### 1. Provider Selection
```typescript
const providers = await client.getEnabledProviders()
const anthropicProvider = client.selectBestProvider('ANTHROPIC', providers.providers)

if (!anthropicProvider) {
  // Fallback to local provider
}
```

### 2. AI Request Routing
```typescript
// Instead of direct provider calls
const cartexProvider = new CartexProvider({ client })
const response = await cartexProvider.chat(messages, tools)

// Automatically:
// - Routes through best available Cartex provider
// - Tracks token usage
// - Logs tool execution
// - Reports provider health
// - Falls back to local if needed
```

### 3. Token Management
```typescript
// Check limits before making requests
const config = await client.getDesktopConfig()

if (config.subscription.tokensRemaining < 100) {
  // Show upgrade prompt
  return
}

// Tokens are automatically deducted on successful AI requests
```

## 📊 Tool Execution Tracking

### Automatic Logging
```typescript
// All tool executions are automatically logged
await client.logToolExecution({
  toolName: 'search_files',
  status: 'COMPLETED',
  inputData: { query: '*.pdf' },
  outputData: { files: [...] },
  executionTimeMs: 1250,
  tokensUsed: 150
})
```

### Usage Analytics
```typescript
// Get execution history
const history = await client.getToolExecutionHistory({
  limit: 50,
  tool: 'search_files'
})

// Displays in Cartex web dashboard automatically
```

## 🔄 Real-time Features

### Configuration Updates
- Provider enable/disable: Instant effect
- Subscription changes: Real-time limit updates  
- Trust status: Immediate feature availability
- Token usage: Live balance updates

### Device Management
- Admin can approve/revoke device access
- Instant feature enabling/disabling
- Remote configuration updates

## 🛡️ Security Features

### Encrypted Communication
- All API calls use HTTPS in production
- Session tokens with secure expiry
- No sensitive data stored locally

### Device Trust
- New devices require admin approval
- Limited functionality for untrusted devices
- Graduated access based on trust level

### Audit Trail
- Complete activity logging
- Provider usage tracking
- Tool execution monitoring
- User action auditing

## 🚀 Benefits Achieved

### For Users
✅ **Unified Experience** - Same login for web and desktop
✅ **Real-time Sync** - Instant configuration updates
✅ **Smart Routing** - Best provider selection automatically
✅ **Usage Transparency** - Clear token consumption tracking

### For Administrators  
✅ **Centralized Control** - Manage all AI providers from web
✅ **Cost Optimization** - Smart routing minimizes costs
✅ **Security** - Complete audit trail and device management
✅ **Scalability** - Easy provider addition and management

### For Developers
✅ **Clean Architecture** - Clear separation of concerns
✅ **API-First** - No database coupling, pure client-server
✅ **Extensible** - Easy to add new features and integrations
✅ **Maintainable** - Centralized configuration and monitoring

## 🔄 Migration Checklist

### Phase 1: Setup ✅
- [x] Create Cartex API client
- [x] Implement authentication integration
- [x] Build configuration sync system
- [x] Create provider routing logic

### Phase 2: Integration
- [ ] Update main electron process
- [ ] Modify AI orchestrator
- [ ] Update IPC handlers
- [ ] Test device registration

### Phase 3: UI Updates
- [ ] Add authentication screens
- [ ] Update settings panel
- [ ] Show provider status
- [ ] Display usage analytics

### Phase 4: Testing
- [ ] Test full authentication flow
- [ ] Verify AI request routing
- [ ] Test configuration sync
- [ ] Validate error handling

### Phase 5: Production
- [ ] Configure production URLs
- [ ] Set up SSL certificates
- [ ] Deploy Cartex web service
- [ ] Monitor integration health

## 📞 Support & Troubleshooting

### Common Issues

**Device Not Trusted**
- Solution: Admin must approve device in Cartex web dashboard

**No Providers Available**
- Solution: Enable AI providers in Cartex admin panel

**Authentication Failed**
- Solution: Check credentials and Cartex service availability

**Token Limit Exceeded**
- Solution: Upgrade subscription or wait for monthly reset

### Debug Mode
Set environment variable for detailed logging:
```bash
DEBUG=cartex:*
```

This integration provides a robust, scalable foundation for unified AI provider management across web and desktop platforms!