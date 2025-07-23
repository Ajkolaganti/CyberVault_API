# CyberVault CPM API Endpoints

## 🔐 Central Policy Manager API Documentation

This document outlines all available API endpoints for interacting with the Central Policy Manager (CPM) service from your frontend application.

## 🔗 Base URL
```
https://your-api-domain.com/api/cpm
```

## 🔑 Authentication
All endpoints require authentication. Include the Bearer token in the Authorization header:

```javascript
headers: {
  'Authorization': 'Bearer your-jwt-token',
  'Content-Type': 'application/json'
}
```

---

## 📊 CPM Status & Monitoring

### GET `/api/cmp/status`
Get overall CPM service status and statistics.

**Response:**
```json
{
  "status": "operational",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "statistics": {
    "total": 150,
    "by_status": {
      "verified": 120,
      "failed": 15,
      "pending": 10,
      "expired": 5
    },
    "by_type": {
      "ssh": 80,
      "api_token": 50,
      "certificate": 20
    },
    "verification_rate": 80,
    "last_scan": "2024-01-01T11:58:00.000Z"
  },
  "recent_activity": [
    {
      "action": "verification",
      "created_at": "2024-01-01T11:58:00.000Z",
      "metadata": {
        "verification_result": "success"
      }
    }
  ],
  "service_info": {
    "version": "1.0.0",
    "uptime": 86400,
    "environment": "production"
  }
}
```

**Frontend Usage:**
```javascript
// Dashboard status widget
const fetchCPMStatus = async () => {
  const response = await fetch('/api/cpm/status', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const status = await response.json();
  
  // Update dashboard widgets
  updateStatusWidget(status.statistics);
  updateRecentActivity(status.recent_activity);
};
```

---

## 🔄 Credential Verification

### POST `/api/cpm/verify`
Manually trigger verification for specific credentials.

**Request Body:**
```json
{
  "credential_ids": ["uuid1", "uuid2", "uuid3"],
  "force": false
}
```

**Response:**
```json
{
  "message": "Verification triggered for 3 credentials",
  "credentials": [
    {
      "id": "uuid1",
      "name": "Production SSH Key",
      "type": "ssh",
      "status": "pending"
    }
  ],
  "estimated_completion": "2024-01-01T12:05:00.000Z"
}
```

**Frontend Usage:**
```javascript
// Verify selected credentials
const triggerVerification = async (credentialIds) => {
  const response = await fetch('/api/cpm/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      credential_ids: credentialIds,
      force: false
    })
  });
  
  const result = await response.json();
  
  // Show success message
  showNotification(`Verification started for ${result.credentials.length} credentials`);
  
  // Refresh credential list after estimated completion
  setTimeout(refreshCredentials, 30000);
};
```

---

## 📜 Verification History

### GET `/api/cpm/credentials/{credentialId}/history`
Get verification history for a specific credential.

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "credential": {
    "id": "uuid1",
    "name": "Production SSH Key",
    "type": "ssh"
  },
  "history": [
    {
      "id": "audit-uuid1",
      "action": "verification",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "result": "success",
      "message": "SSH connection successful",
      "error": null,
      "details": {
        "performed_by": "cpm-system",
        "duration": 1500,
        "error_category": null
      }
    },
    {
      "id": "audit-uuid2",
      "action": "verification",
      "timestamp": "2024-01-01T11:00:00.000Z",
      "result": "failed",
      "message": "Connection timeout",
      "error": "ETIMEDOUT",
      "details": {
        "performed_by": "cmp-system",
        "duration": 30000,
        "error_category": "timeout"
      }
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 50,
    "total": 2
  }
}
```

**Frontend Usage:**
```javascript
// Credential detail page - verification history
const loadVerificationHistory = async (credentialId, page = 0) => {
  const response = await fetch(
    `/api/cpm/credentials/${credentialId}/history?limit=20&offset=${page * 20}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  const history = await response.json();
  
  // Render history timeline
  renderVerificationTimeline(history.history);
};
```

---

## ⚠️ Credentials Requiring Attention

### GET `/api/cpm/credentials/attention`
Get credentials that need attention (failed, pending, never verified, stale).

**Query Parameters:**
- `type` (optional): Filter by credential type
- `status` (optional): Filter by specific status

**Response:**
```json
{
  "summary": {
    "total": 45,
    "never_verified": 10,
    "failed": 15,
    "pending": 5,
    "stale": 15
  },
  "credentials": [
    {
      "id": "uuid1",
      "type": "ssh",
      "name": "Critical Production Server",
      "status": "failed",
      "verified_at": null,
      "last_verification_attempt": "2024-01-01T11:00:00.000Z",
      "verification_error": "Authentication failed",
      "urgency": 18,
      "days_since_verification": null
    },
    {
      "id": "uuid2",
      "type": "api_token",
      "name": "Payment API Token",
      "status": "verified",
      "verified_at": "2023-11-01T10:00:00.000Z",
      "urgency": 6,
      "days_since_verification": 45
    }
  ],
  "categories": {
    "never_verified": [...],
    "failed": [...],
    "pending": [...],
    "stale": [...]
  }
}
```

**Frontend Usage:**
```javascript
// Attention dashboard widget
const loadCredentialsNeedingAttention = async () => {
  const response = await fetch('/api/cpm/credentials/attention', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const attention = await response.json();
  
  // Update attention widgets
  updateAttentionSummary(attention.summary);
  renderHighPriorityCredentials(
    attention.credentials.filter(c => c.urgency > 10)
  );
};

// Filter by type
const loadFailedSSHCredentials = async () => {
  const response = await fetch('/api/cpm/credentials/attention?type=ssh&status=failed', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const failed = await response.json();
  renderFailedCredentials(failed.credentials);
};
```

---

## 🔧 Admin Operations

### POST `/api/cpm/credentials/batch-update` (Admin Only)
Batch update credential status.

**Request Body:**
```json
{
  "credential_ids": ["uuid1", "uuid2"],
  "status": "verified",
  "reason": "Manual verification completed"
}
```

**Response:**
```json
{
  "message": "Updated 2 credentials to verified",
  "updated_credentials": [
    {
      "id": "uuid1",
      "name": "Production SSH",
      "type": "ssh",
      "old_status": "failed",
      "new_status": "verified"
    }
  ]
}
```

**Frontend Usage:**
```javascript
// Admin panel - batch operations
const batchUpdateStatus = async (credentialIds, newStatus, reason) => {
  const response = await fetch('/api/cpm/credentials/batch-update', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      credential_ids: credentialIds,
      status: newStatus,
      reason: reason
    })
  });
  
  const result = await response.json();
  showSuccess(`Updated ${result.updated_credentials.length} credentials`);
  refreshCredentialList();
};
```

### GET `/api/cpm/configuration` (Admin Only)
Get CPM service configuration.

**Response:**
```json
{
  "configuration": {
    "scanning": {
      "interval": 30000,
      "batch_size": 10,
      "max_concurrent": 5
    },
    "timeouts": {
      "verification": 30000,
      "ssh": 15000,
      "api": 10000
    },
    "features": {
      "ssh_verification": true,
      "api_verification": true,
      "cert_verification": false,
      "db_verification": false
    },
    "retry": {
      "max_retries": 3,
      "retry_delay": 5000,
      "exponential_backoff": true
    },
    "logging": {
      "level": "info",
      "to_file": true,
      "file_path": "./logs/cpm.log"
    }
  },
  "environment": "production",
  "last_updated": "2024-01-01T12:00:00.000Z"
}
```

---

## 🏥 Health & Monitoring Endpoints

### GET `/health` (Standalone - Port 3001)
CPM service health check.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "cybervault-cpm",
  "version": "1.0.0",
  "uptime": 86400,
  "memory": {
    "used": 128,
    "total": 256
  },
  "checks": {
    "database": {
      "status": "healthy",
      "response_time": 45
    },
    "memory": {
      "status": "healthy",
      "used_mb": 128
    },
    "process": {
      "status": "healthy",
      "pid": 12345,
      "node_version": "v18.17.0",
      "platform": "linux"
    }
  },
  "response_time": 50
}
```

### GET `/metrics` (Standalone - Port 3001)
Service metrics for monitoring.

**Response:**
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "credentials": {
    "total": 150,
    "by_status": { "verified": 120, "failed": 20, "pending": 10 },
    "by_type": { "ssh": 80, "api_token": 70 },
    "verified_last_24h": 25,
    "verified_last_week": 100,
    "never_verified": 15,
    "stale_verifications": 20
  },
  "system": {
    "uptime": 86400,
    "memory_usage_mb": 128,
    "memory_total_mb": 256,
    "node_version": "v18.17.0",
    "platform": "linux",
    "pid": 12345
  }
}
```

---

## 🎨 Frontend Integration Examples

### React Component - CPM Dashboard

```jsx
import React, { useState, useEffect } from 'react';

const CPMDashboard = () => {
  const [status, setStatus] = useState(null);
  const [attention, setAttention] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [statusRes, attentionRes] = await Promise.all([
          fetch('/api/cpm/status', { 
            headers: { 'Authorization': `Bearer ${getToken()}` }
          }),
          fetch('/api/cpm/credentials/attention', { 
            headers: { 'Authorization': `Bearer ${getToken()}` }
          })
        ]);

        setStatus(await statusRes.json());
        setAttention(await attentionRes.json());
      } catch (error) {
        console.error('Failed to load CPM dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleVerifySelected = async (credentialIds) => {
    try {
      const response = await fetch('/api/cpm/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ credential_ids: credentialIds })
      });

      const result = await response.json();
      
      // Show success notification
      showNotification(`Verification started for ${result.credentials.length} credentials`);
      
      // Refresh data
      setTimeout(() => window.location.reload(), 5000);
      
    } catch (error) {
      showError('Failed to trigger verification');
    }
  };

  if (loading) return <div>Loading CPM Dashboard...</div>;

  return (
    <div className="cpm-dashboard">
      <div className="status-overview">
        <h2>CPM Status</h2>
        <div className="stats-grid">
          <StatCard 
            title="Total Credentials" 
            value={status.statistics.total}
            trend="stable"
          />
          <StatCard 
            title="Verification Rate" 
            value={`${status.statistics.verification_rate}%`}
            trend={status.statistics.verification_rate > 80 ? 'up' : 'down'}
          />
          <StatCard 
            title="Failed Verifications" 
            value={status.statistics.by_status.failed || 0}
            trend="alert"
          />
        </div>
      </div>

      <div className="attention-section">
        <h2>Credentials Requiring Attention</h2>
        <AttentionSummary summary={attention.summary} />
        
        <div className="high-priority">
          <h3>High Priority ({attention.credentials.filter(c => c.urgency > 10).length})</h3>
          <CredentialList 
            credentials={attention.credentials.filter(c => c.urgency > 10)}
            onVerify={handleVerifySelected}
          />
        </div>
      </div>

      <div className="recent-activity">  
        <h2>Recent Activity</h2>
        <ActivityFeed activities={status.recent_activity} />
      </div>
    </div>
  );
};
```

### Vue.js Component - Credential Manager

```vue
<template>
  <div class="credential-manager">
    <div class="filters">
      <select v-model="selectedType" @change="loadCredentials">
        <option value="">All Types</option>
        <option value="ssh">SSH</option>
        <option value="api_token">API Token</option>
      </select>
      
      <select v-model="selectedStatus" @change="loadCredentials">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="failed">Failed</option>
        <option value="verified">Verified</option>
      </select>
    </div>

    <div class="actions">
      <button 
        @click="verifySelected" 
        :disabled="selectedCredentials.length === 0"
        class="btn-primary"
      >
        Verify Selected ({{ selectedCredentials.length }})
      </button>
    </div>

    <div class="credential-list">
      <div 
        v-for="credential in credentials" 
        :key="credential.id"
        class="credential-item"
        :class="{ 'high-urgency': credential.urgency > 10 }"
      >
        <input 
          type="checkbox" 
          :value="credential.id"
          v-model="selectedCredentials"
        />
        
        <div class="credential-info">
          <h4>{{ credential.name }}</h4>
          <span class="type">{{ credential.type }}</span>
          <span class="status" :class="credential.status">
            {{ credential.status }}
          </span>
        </div>

        <div class="verification-info">
          <span v-if="credential.verified_at">
            Last verified: {{ formatDate(credential.verified_at) }}
          </span>
          <span v-else class="never-verified">Never verified</span>
          
          <span v-if="credential.verification_error" class="error">
            {{ credential.verification_error }}
          </span>
        </div>

        <div class="actions">
          <button @click="viewHistory(credential.id)" class="btn-secondary">
            History
          </button>
          <button @click="verifySingle(credential.id)" class="btn-primary">
            Verify Now
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      credentials: [],
      selectedCredentials: [],
      selectedType: '',
      selectedStatus: '',
      loading: false
    };
  },

  methods: {
    async loadCredentials() {
      this.loading = true;
      try {
        const params = new URLSearchParams();
        if (this.selectedType) params.append('type', this.selectedType);
        if (this.selectedStatus) params.append('status', this.selectedStatus);

        const response = await fetch(`/api/cpm/credentials/attention?${params}`, {
          headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });

        const data = await response.json();
        this.credentials = data.credentials;
      } catch (error) {
        this.$toast.error('Failed to load credentials');
      } finally {
        this.loading = false;
      }
    },

    async verifySelected() {
      if (this.selectedCredentials.length === 0) return;

      try {
        const response = await fetch('/api/cpm/verify', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            credential_ids: this.selectedCredentials
          })
        });

        const result = await response.json();
        
        this.$toast.success(`Verification started for ${result.credentials.length} credentials`);
        this.selectedCredentials = [];
        
        // Refresh after 10 seconds
        setTimeout(() => this.loadCredentials(), 10000);
        
      } catch (error) {
        this.$toast.error('Failed to trigger verification');
      }
    },

    async verifySingle(credentialId) {
      await this.verifyCredentials([credentialId]);
    },

    viewHistory(credentialId) {
      this.$router.push(`/credentials/${credentialId}/history`);
    },

    formatDate(dateString) {
      return new Date(dateString).toLocaleDateString();
    },

    getToken() {
      return localStorage.getItem('auth_token');
    }
  },

  mounted() {
    this.loadCredentials();
  }
};
</script>
```

---

## 🔒 Error Handling

All endpoints return consistent error formats:

```json
{
  "error": "Validation failed",
  "message": "credential_ids array is required",
  "details": [
    {
      "field": "credential_ids",
      "message": "This field is required"
    }
  ]
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## 🚀 Quick Start Integration

1. **Add CPM routes to your main router:**
```javascript
import cpmRoutes from './routes/cpmRoutes.js';
app.use('/api/cpm', cpmRoutes);
```

2. **Create a CPM service class:**
```javascript
class CPMService {
  constructor(apiUrl, getToken) {
    this.apiUrl = apiUrl;
    this.getToken = getToken;
  }

  async getStatus() {
    return this.request('/api/cpm/status');
  }

  async triggerVerification(credentialIds, force = false) {
    return this.request('/api/cpm/verify', 'POST', {
      credential_ids: credentialIds,
      force
    });
  }

  async getCredentialsNeedingAttention(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/api/cpm/credentials/attention?${params}`);
  }

  async request(endpoint, method = 'GET', body = null) {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// Usage
const cpm = new CPMService('https://api.cybervault.com', () => getAuthToken());
const status = await cmp.getStatus();
```

3. **Set up real-time updates (optional):**
```javascript
// Poll for updates every 30 seconds
const setupCPMPolling = (callback) => {
  const poll = async () => {
    try {
      const status = await cpm.getStatus();
      callback(status);
    } catch (error) {
      console.error('CPM polling failed:', error);
    }
  };

  poll(); // Initial load
  return setInterval(poll, 30000);
};

// Usage
const interval = setupCPMPolling((status) => {
  updateDashboard(status);
});

// Cleanup
clearInterval(interval);
```

---

**🎉 Your frontend now has complete integration with the CPM system!**

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "1", "content": "Create CPM API controller for frontend endpoints", "status": "completed", "priority": "high"}, {"id": "2", "content": "Create credential management endpoints", "status": "completed", "priority": "high"}, {"id": "3", "content": "Create CPM monitoring and status endpoints", "status": "completed", "priority": "high"}, {"id": "4", "content": "Create routes configuration", "status": "completed", "priority": "high"}, {"id": "5", "content": "Document all API endpoints", "status": "completed", "priority": "high"}]