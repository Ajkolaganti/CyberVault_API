# CyberVault CPM - Supported Credential Types

## 🔐 Overview

The Central Policy Manager (CPM) now supports comprehensive credential verification across multiple systems and platforms. This document outlines all supported credential types and their configuration formats.

## 📊 **Supported Credential Types**

### **1. SSH Credentials** (`type: "ssh"`)
**Verifies:** Linux/Unix systems, network devices, cloud instances

**Configuration:**
```json
{
  "host": "server.example.com",
  "port": 22,
  "username": "admin",
  "password": "secret123"
}
```

**With SSH Key:**
```json
{
  "host": "server.example.com",
  "port": 22,
  "username": "admin",
  "privateKey": "-----BEGIN PRIVATE KEY-----\n...",
  "passphrase": "keypassword"
}
```

**System Types:** `Linux`, `Unix`, `Network`, `Cloud`, `AWS`, `Azure`

---

### **2. Windows/RDP Credentials** (`type: "password"` + `system_type: "Windows"`)
**Verifies:** Windows servers, domain controllers, workstations

**Configuration:**
```json
{
  "host": "windows-server.com",
  "port": 3389,
  "username": "administrator",
  "password": "Password123!",
  "domain": "CORPORATE",
  "method": "rdp"
}
```

**Verification Methods:**
- **RDP**: Remote Desktop Protocol connection
- **WinRM**: Windows Remote Management
- **SMB**: SMB/CIFS share access
- **WMI**: Windows Management Instrumentation

**System Types:** `Windows`, `Operating System`

---

### **3. Database Credentials** (`type: "database"`)
**Verifies:** Database servers across multiple platforms

**MySQL/MariaDB:**
```json
{
  "type": "mysql",
  "host": "db.example.com",
  "port": 3306,
  "username": "dbuser",
  "password": "dbpass",
  "database": "production",
  "ssl": false
}
```

**PostgreSQL:**
```json
{
  "type": "postgresql",
  "host": "postgres.example.com",
  "port": 5432,
  "username": "postgres",
  "password": "pgpass",
  "database": "myapp"
}
```

**MongoDB:**
```json
{
  "type": "mongodb",
  "host": "mongo.example.com",
  "port": 27017,
  "username": "mongouser",
  "password": "mongopass",
  "database": "admin"
}
```

**Oracle:**
```json
{
  "type": "oracle",
  "host": "oracle.example.com",
  "port": 1521,
  "username": "system",
  "password": "oraclepass",
  "serviceName": "XE"
}
```

**SQL Server:**
```json
{
  "type": "sqlserver",
  "host": "mssql.example.com",
  "port": 1433,
  "username": "sa",
  "password": "SqlPass123!",
  "database": "master",
  "encrypt": true
}
```

**Redis:**
```json
{
  "type": "redis",
  "host": "redis.example.com",
  "port": 6379,
  "password": "redispass",
  "database": 0
}
```

**System Types:** `Database`, `Oracle DB`

---

### **4. API Token Credentials** (`type: "api_token"`)
**Verifies:** REST APIs, web services, cloud APIs

**Bearer Token:**
```json
{
  "token": "your-bearer-token",
  "type": "bearer",
  "endpoint": "https://api.example.com/test"
}
```

**API Key:**
```json
{
  "token": "your-api-key",
  "type": "api_key",
  "header": "X-API-Key",
  "endpoint": "https://api.example.com/status"
}
```

**Basic Auth:**
```json
{
  "token": "username:password",
  "type": "basic",
  "endpoint": "https://api.example.com/health"
}
```

**System Types:** `Cloud`, `Application`, `AWS`, `Azure`

---

### **5. Website Credentials** (`type: "password"` + `system_type: "Website"`)
**Verifies:** Web applications, admin panels, login forms

**Basic Authentication:**
```json
{
  "url": "https://admin.example.com",
  "username": "admin",
  "password": "webpass",
  "method": "basic_auth"
}
```

**Form-based Login:**
```json
{
  "loginUrl": "https://app.example.com/login",
  "successUrl": "https://app.example.com/dashboard",
  "username": "user@example.com",
  "password": "formpass",
  "method": "form_login",
  "successIndicator": "Welcome"
}
```

**Bearer Token:**
```json
{
  "url": "https://api.example.com/protected",
  "token": "bearer-token",
  "method": "bearer_token"
}
```

**System Types:** `Website`, `Application`

---

### **6. Certificate Credentials** (`type: "certificate"`)
**Verifies:** SSL/TLS certificates, client certificates, CA certificates

**Client Certificate:**
```json
{
  "type": "client_cert",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "privateKey": "-----BEGIN PRIVATE KEY-----\n...",
  "host": "secure.example.com",
  "port": 443,
  "passphrase": "certpass"
}
```

**Server Certificate:**
```json
{
  "type": "server_cert",
  "host": "website.example.com",
  "port": 443
}
```

**CA Certificate:**
```json
{
  "type": "ca_cert",
  "certificate": "-----BEGIN CERTIFICATE-----\n..."
}
```

**Code Signing Certificate:**
```json
{
  "type": "code_signing",
  "certificate": "-----BEGIN CERTIFICATE-----\n..."
}
```

**System Types:** `Certificates`, `Security`

---

## 🔧 **Configuration Environment Variables**

Add these to your `.env` file to configure the new verifiers:

```bash
# New Verifier Feature Flags
CPM_ENABLE_WINDOWS=true              # Enable Windows/RDP verification
CPM_ENABLE_WEBSITE=true              # Enable Website verification
CPM_ENABLE_DATABASE=true             # Enable Database verification
CPM_ENABLE_CERTIFICATE=true          # Enable Certificate verification

# New Timeout Configurations
CPM_WINDOWS_TIMEOUT=20000            # Windows verification timeout (20s)
CPM_DATABASE_TIMEOUT=15000           # Database verification timeout (15s)
CPM_WEBSITE_TIMEOUT=10000            # Website verification timeout (10s)
CPM_CERTIFICATE_TIMEOUT=10000        # Certificate verification timeout (10s)
```

## 🗄️ **Database Schema Updates**

Run this migration to support the new credential types:

```sql
-- Add system_type column for verification routing
ALTER TABLE public.credentials 
ADD COLUMN IF NOT EXISTS system_type text;

-- Add connection details columns
ALTER TABLE public.credentials 
ADD COLUMN IF NOT EXISTS host text,
ADD COLUMN IF NOT EXISTS port integer,
ADD COLUMN IF NOT EXISTS username text;

-- Update credential type constraint to include new types
ALTER TABLE public.credentials 
DROP CONSTRAINT IF EXISTS credentials_type_check;

ALTER TABLE public.credentials 
ADD CONSTRAINT credentials_type_check 
CHECK (type IN ('password','ssh','api_token','certificate','database'));
```

## 📦 **Required Dependencies**

Install additional packages for full functionality:

```bash
# Core dependencies (required)
npm install mysql2 pg

# Optional dependencies for specific database types
npm install mongodb oracledb mssql redis

# Website verification dependencies
npm install jsdom

# Development/testing tools
npm install xfreerdp smbclient powershell
```

## 🎯 **Verification Logic**

The CPM automatically selects the appropriate verifier based on:

1. **Credential Type** (`ssh`, `api_token`, `database`, `certificate`)
2. **System Type** (`Windows`, `Linux`, `Database`, `Website`, etc.)
3. **Port Number** (automatic detection):
   - `22` → SSH
   - `3389` → Windows/RDP
   - `3306` → MySQL
   - `5432` → PostgreSQL
   - `443/80` → Website/HTTPS
   - `1521` → Oracle
   - `1433` → SQL Server
   - `27017` → MongoDB

## 🔍 **Verification Process**

For each credential type, the CPM performs:

### **SSH/Linux:**
1. Establishes SSH connection
2. Executes test command (`echo "CPM-Test-$(date)"`)
3. Validates response

### **Windows:**
1. Attempts RDP connection test
2. Falls back to WinRM if available
3. Tests SMB share access
4. Validates authentication

### **Database:**
1. Establishes database connection
2. Executes version query
3. Validates connection and permissions

### **Website:**
1. Attempts Basic Auth if configured
2. Parses login forms for form-based auth
3. Tests API endpoints for token auth
4. Validates response codes and content

### **Certificate:**
1. Parses certificate content
2. Validates expiration dates
3. Tests server connections (if applicable)
4. Checks certificate chain

## 📊 **Monitoring & Metrics**

The CPM tracks verification metrics by:
- **Credential Type** (ssh, database, windows, etc.)
- **System Type** (Linux, Windows, Database, etc.)
- **Verification Result** (success, failed, timeout, etc.)
- **Response Time** for performance monitoring

## 🚨 **Error Categories**

Each verifier categorizes errors for better troubleshooting:

- `timeout` - Connection or response timeout
- `authentication` - Invalid credentials
- `connection_refused` - Service not running
- `host_not_found` - Invalid hostname/IP
- `permission_denied` - Access denied
- `certificate_invalid` - Certificate issues
- `configuration` - Invalid credential format

## 🔒 **Security Best Practices**

1. **Least Privilege**: Use accounts with minimal required permissions
2. **Regular Rotation**: Rotate credentials based on verification results
3. **Network Segmentation**: Restrict CPM network access
4. **Audit Logging**: Monitor all verification activities
5. **Secure Storage**: All credentials encrypted in database
6. **Dependency Updates**: Keep verification libraries updated

## 🎉 **Quick Start Examples**

### **Add Windows Server Credential:**
```javascript
const credential = {
  type: 'password',
  system_type: 'Windows',
  name: 'Production Windows Server',
  host: '192.168.1.100',
  port: 3389,
  username: 'administrator',
  value: encrypt(JSON.stringify({
    password: 'SecurePass123!',
    domain: 'CORP',
    method: 'rdp'
  }))
};
```

### **Add Database Credential:**
```javascript
const credential = {
  type: 'database',
  name: 'Production MySQL',
  host: 'db.company.com',
  port: 3306,
  username: 'app_user',
  value: encrypt(JSON.stringify({
    type: 'mysql',
    password: 'dbPassword123!',
    database: 'production',
    ssl: true
  }))
};
```

### **Add Website Credential:**
```javascript
const credential = {
  type: 'password',
  system_type: 'Website',
  name: 'Admin Portal',
  host: 'https://admin.company.com',
  username: 'admin@company.com',
  value: encrypt(JSON.stringify({
    password: 'AdminPass123!',
    method: 'form_login',
    loginUrl: 'https://admin.company.com/login',
    successIndicator: 'Dashboard'
  }))
};
```

---

**🎯 The CPM now provides comprehensive credential verification across your entire infrastructure!**