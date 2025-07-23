# CyberVault Central Policy Manager (CPM) Setup Guide

## 🔐 Overview

The Central Policy Manager (CPM) is a background service that automatically verifies credentials in your CyberVault system. It continuously monitors the `credentials` table and performs verification tests for SSH connections and API tokens.

## 📋 Prerequisites

1. **Node.js 16+** installed
2. **Database migration** applied (see Database Setup)
3. **Environment variables** configured
4. **Dependencies** installed

## 🗄️ Database Setup

First, apply the credential verification migration:

```sql
-- Run this in your Supabase SQL editor
-- File: supabase/migrations/add_credential_verification.sql

ALTER TABLE public.credentials 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_verification_attempt timestamp with time zone,
ADD COLUMN IF NOT EXISTS verification_error text,
ADD COLUMN IF NOT EXISTS host text,
ADD COLUMN IF NOT EXISTS port integer,
ADD COLUMN IF NOT EXISTS username text;

CREATE INDEX IF NOT EXISTS idx_credentials_status ON public.credentials(status);
CREATE INDEX IF NOT EXISTS idx_credentials_verification ON public.credentials(status, verified_at) WHERE status IN ('pending') OR verified_at IS NULL;
```

## 📦 Installation

1. **Install CPM dependencies:**
```bash
npm install node-ssh@^13.1.0 node-fetch@^3.3.2
```

2. **For development (optional):**
```bash
npm install --save-dev nodemon@^3.0.1
```

## ⚙️ Configuration

Add these environment variables to your `.env` file:

```bash
# CPM Configuration
CPM_SCAN_INTERVAL=30000              # Scan every 30 seconds
CPM_BATCH_SIZE=10                    # Process 10 credentials per batch
CPM_MAX_CONCURRENT=5                 # Max 5 concurrent verifications
CPM_VERIFICATION_TIMEOUT=30000       # 30 second timeout
CPM_SSH_TIMEOUT=15000               # 15 second SSH timeout
CPM_API_TIMEOUT=10000               # 10 second API timeout
CPM_MAX_RETRIES=3                   # Retry failed verifications 3 times
CPM_RETRY_DELAY=5000                # Wait 5 seconds between retries

# Feature Toggles
CPM_ENABLE_SSH=true                 # Enable SSH verification
CPM_ENABLE_API=true                 # Enable API token verification
CPM_ENABLE_CERT=false               # Certificate verification (future)
CPM_ENABLE_DB=false                 # Database verification (future)

# Logging
CPM_LOG_LEVEL=info                  # debug, info, warn, error
CPM_LOG_TO_FILE=true                # Write logs to file
CPM_LOG_FILE=./logs/cpm.log         # Log file path

# Test Endpoints
CPM_TEST_API_ENDPOINT=https://httpbin.org/bearer

# Health Check
CPM_HEALTH_CHECK=true               # Enable health check endpoint
CPM_HEALTH_PORT=3001                # Health check port

# Metrics
CPM_ENABLE_METRICS=true             # Enable metrics collection
CPM_METRICS_RETENTION=30            # Keep metrics for 30 days
```

## 🚀 Running CPM

### Development Mode
```bash
# Start with auto-reload
npm run cmp:dev

# Or manually
node src/cpm/index.js
```

### Production Mode
```bash
# Start CPM service
npm run cpm:start

# Run in background with PM2 (recommended)
pm2 start src/cpm/index.js --name "cybervault-cpm"
pm2 save
pm2 startup
```

### Systemd Service (Linux)
Create `/etc/systemd/system/cybervault-cpm.service`:

```ini
[Unit]
Description=CyberVault Central Policy Manager
After=network.target

[Service]
Type=simple
User=cybervault
WorkingDirectory=/path/to/cybervault
ExecStart=/usr/bin/node src/cpm/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable cybervault-cpm
sudo systemctl start cybervault-cpm
sudo systemctl status cybervault-cmp
```

## 🧪 Testing

Run the test suite to verify everything works:

```bash
npm run cpm:test
```

This will test:
- Configuration validation
- SSH verifier (mock test)
- API verifier (live test with httpbin.org)
- Credential validation
- Error handling

## 📊 Monitoring

### Health Check
```bash
# Check service health
curl http://localhost:3001/health
```

### Logs
```bash
# View real-time logs
npm run cpm:logs

# Or manually
tail -f logs/cpm.log
```

### Service Status
Check the audit logs in your database:
```sql
SELECT * FROM audit_logs 
WHERE action LIKE 'cpm_%' 
ORDER BY created_at DESC 
LIMIT 10;
```

## 🔧 Credential Formats

### SSH Credentials
```json
{
  "host": "server.example.com",
  "port": 22,
  "username": "admin",
  "password": "secret123"
}
```

Or with SSH key:
```json
{
  "host": "server.example.com", 
  "port": 22,
  "username": "admin",
  "privateKey": "-----BEGIN PRIVATE KEY-----\\n...",
  "passphrase": "keypassword"
}
```

### API Token Credentials  
```json
{
  "token": "your-api-token",
  "type": "bearer",
  "endpoint": "https://api.example.com/test"
}
```

Or simple format:
```
just-the-token-string
```

## 📈 Performance Tuning

### High Volume Environments
```bash
# Increase batch size and concurrent verifications
CPM_BATCH_SIZE=50
CPM_MAX_CONCURRENT=15
CPM_SCAN_INTERVAL=10000

# Reduce timeouts for faster processing
CPM_SSH_TIMEOUT=10000
CPM_API_TIMEOUT=5000
```

### Low Resource Environments
```bash
# Reduce concurrency and increase intervals  
CPM_BATCH_SIZE=5
CPM_MAX_CONCURRENT=2
CPM_SCAN_INTERVAL=60000
```

## 🔒 Security Considerations

1. **Network Access**: CPM needs outbound access to verify SSH/API endpoints
2. **Credentials**: All credentials are decrypted in memory during verification
3. **Logging**: Sensitive data is never logged (only metadata)
4. **Permissions**: Run CPM with minimal required permissions
5. **Monitoring**: Monitor for suspicious verification patterns

## 🚨 Troubleshooting

### Common Issues

**CPM won't start:**
- Check environment variables (especially `ENCRYPTION_KEY` and `ENCRYPTION_IV`)
- Verify database connection
- Check Node.js version (16+ required)

**Verifications failing:**
- Check network connectivity
- Verify credential formats
- Check timeout settings
- Review error logs

**High CPU usage:**
- Reduce `CPM_MAX_CONCURRENT`
- Increase `CPM_SCAN_INTERVAL`
- Check for credential format issues

### Debug Mode
```bash
CPM_LOG_LEVEL=debug node src/cpm/index.js
```

## 📝 Logs

CPM produces structured logs with these levels:
- **ERROR**: Critical failures
- **WARN**: Non-critical issues  
- **INFO**: General operations
- **DEBUG**: Detailed debugging info

Log format:
```
[2024-01-01T12:00:00.000Z] [PID:12345] [INFO ] Starting credential verification scan...
```

## 🔄 Maintenance

### Regular Tasks
1. **Monitor logs** for errors and performance
2. **Review metrics** for verification success rates  
3. **Update credentials** that consistently fail
4. **Clean up old logs** (automated every 10 scans)
5. **Monitor disk space** for log files

### Updates
1. Stop CPM service
2. Update code/dependencies
3. Run tests: `npm run cpm:test`  
4. Restart service
5. Monitor logs for issues

## 📞 Support

For issues or questions:
1. Check logs first: `tail -f logs/cpm.log`
2. Run tests: `npm run cpm:test`
3. Check database connectivity
4. Review configuration settings
5. Consult audit logs in database

---

**🎉 CPM is now ready to automatically verify your credentials!**