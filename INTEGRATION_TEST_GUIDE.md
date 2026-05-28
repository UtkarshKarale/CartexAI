# Cartex + JiFile Integration Test Guide

## 🧪 Testing the Complete Integration

This guide walks through testing the full Cartex integration with JiFile desktop.

## Prerequisites

### 1. Cartex Web Service Running
```bash
cd /home/utkarsh/Desktop/code/cartex-web
npm run dev
# Should be running on http://localhost:3001
```

### 2. Database Seeded
```bash
cd /home/utkarsh/Desktop/code/cartex-web
npx prisma db push
npx prisma db seed
```

Test credentials will be:
- Admin: `admin@cartex.ai` / `admin123456`
- Test User: `test@cartex.ai` / `test123456`

### 3. Environment Variables Set
In JiFile desktop `.env`:
```bash
CARTEX_API_URL=http://localhost:3001
ENABLE_CARTEX_INTEGRATION=true
```

## Test Scenarios

### ✅ Scenario 1: Fresh Device Registration

**Steps:**
1. Start JiFile Desktop (fresh install or clear data)
2. Check console logs for device registration
3. Navigate to Cartex admin at http://localhost:3001/admin
4. Verify new device appears in Desktop Devices section
5. Note device status is "Pending Approval"

**Expected Results:**
- Device auto-registers with unique deviceId
- Device appears in admin dashboard
- Status shows "Pending Approval"
- JiFile falls back to local providers

### ✅ Scenario 2: Admin Device Approval

**Steps:**
1. Login to Cartex admin: http://localhost:3001/admin
2. Go to Desktop Devices section
3. Find your test device (JiFile Desktop - {hostname})
4. Click "Approve Device"
5. Return to JiFile Desktop

**Expected Results:**
- Device status changes to "Trusted"
- JiFile detects trust status change within 30 seconds
- Advanced features become available

### ✅ Scenario 3: User Authentication

**Steps:**
1. In JiFile, navigate to Cartex login screen (or create component)
2. Enter test credentials: `test@cartex.ai` / `test123456`
3. Submit login form
4. Check authentication status

**Expected Results:**
- Login succeeds and returns user info
- Session token stored securely
- Config sync starts automatically
- User info displayed in status component

### ✅ Scenario 4: Provider Configuration Sync

**Steps:**
1. While authenticated, check JiFile provider status
2. Login to Cartex web: http://localhost:3001
3. Add/enable AI provider keys (e.g., Anthropic)
4. Return to JiFile within 30 seconds

**Expected Results:**
- JiFile detects new provider configuration
- AI requests route through Cartex
- Token usage tracked in real-time
- Provider status updates in JiFile UI

### ✅ Scenario 5: AI Request Routing

**Steps:**
1. With Cartex providers enabled, make AI chat request in JiFile
2. Check JiFile console for routing logs
3. Monitor Cartex admin dashboard for usage logs
4. Verify response quality and speed

**Expected Results:**
- Request routes through Cartex API
- Uses best available provider automatically
- Usage logged in Cartex dashboard
- Tokens deducted from subscription
- Tool execution logged

### ✅ Scenario 6: Fallback Behavior

**Steps:**
1. Stop Cartex web service
2. Make AI request in JiFile
3. Observe fallback to local providers
4. Restart Cartex service
5. Make another request

**Expected Results:**
- JiFile detects Cartex unavailable
- Falls back to local Ollama/providers gracefully
- User sees fallback notification
- Reconnects automatically when service returns

### ✅ Scenario 7: Device Trust Security

**Steps:**
1. Create untrusted device (reset device registration)
2. Attempt to use advanced tools (file operations)
3. Compare with trusted device capabilities

**Expected Results:**
- Untrusted device has limited tool access
- Only basic tools allowed (list_files, read_file, search_files)
- Advanced tools blocked with clear messaging
- Trust status clearly displayed

## Manual Testing Checklist

### Authentication Flow
- [ ] Device auto-registration works
- [ ] User login/logout functions
- [ ] Session persistence across app restarts
- [ ] Invalid credentials handled gracefully

### Configuration Sync
- [ ] Real-time config updates (within 30 seconds)
- [ ] Provider enable/disable reflects immediately
- [ ] Subscription changes update token limits
- [ ] Offline/fallback config loading works

### AI Request Routing
- [ ] Requests route through Cartex when available
- [ ] Falls back to local when Cartex unavailable
- [ ] Provider rotation works correctly
- [ ] Token usage tracked accurately

### Security & Permissions
- [ ] Untrusted devices have limited access
- [ ] Trusted devices have full capabilities
- [ ] Admin can approve/revoke device access
- [ ] API keys never exposed to desktop

### UI Integration
- [ ] Cartex authentication screen works
- [ ] Device/provider status displayed correctly
- [ ] Error states handled gracefully
- [ ] Loading states provide feedback

## Debugging Tips

### Common Issues

**Device Not Appearing in Admin Dashboard**
- Check CARTEX_API_URL in desktop .env
- Verify Cartex web service is running
- Check browser network tab for failed requests
- Review desktop console logs for registration errors

**Authentication Failing**
- Verify test user exists (run `npx prisma db seed`)
- Check password complexity requirements
- Ensure Cartex API is accessible from desktop
- Review browser network requests for auth errors

**Config Sync Not Working**
- Check if user is authenticated
- Verify device is trusted/approved
- Monitor config sync interval (30 seconds)
- Check for API errors in console logs

**AI Requests Not Routing**
- Verify providers are enabled in Cartex admin
- Check subscription token balance
- Monitor console logs for routing decisions
- Ensure API keys are configured in Cartex

### Log Monitoring

**Desktop Console Logs:**
```
[cartex] Device registered: abc123
[cartex] Cartex integration initialized successfully  
[runtime] Using Cartex orchestrator for AI request
[orchestrator] Using Cartex provider
```

**Browser Network Tab:**
- `POST /api/desktop/register` - Device registration
- `POST /api/auth/signin` - User authentication  
- `GET /api/desktop/config` - Configuration sync
- `POST /api/desktop/providers` - Provider usage reporting

## Performance Testing

### Load Testing
- [ ] Multiple simultaneous AI requests
- [ ] Large file operations through MCP
- [ ] Extended chat conversations
- [ ] Provider failover scenarios

### Network Testing
- [ ] Slow network conditions
- [ ] Intermittent connectivity
- [ ] API timeout handling
- [ ] Retry logic verification

## Security Testing

### Data Protection
- [ ] No API keys stored locally
- [ ] Session tokens encrypted in storage
- [ ] Device IDs are unique and secure
- [ ] User data protected during transmission

### Access Control
- [ ] Device trust enforced properly
- [ ] Tool permissions respect trust level
- [ ] Admin controls work as expected
- [ ] Session expiry handled correctly

## Success Criteria

The integration is successful when:

1. ✅ Device registration happens automatically
2. ✅ User authentication works seamlessly
3. ✅ Real-time config sync operates reliably
4. ✅ AI requests route through Cartex providers
5. ✅ Fallback to local providers works when needed
6. ✅ Security controls function as designed
7. ✅ UI provides clear status and error feedback
8. ✅ Performance remains acceptable
9. ✅ Token usage tracking is accurate
10. ✅ Admin controls work from web dashboard

When all scenarios pass, the Cartex + JiFile integration is ready for production use!