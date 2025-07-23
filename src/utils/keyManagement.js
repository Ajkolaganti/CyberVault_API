import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Key rotation management for enhanced security
class KeyManager {
  constructor() {
    this.keyRotationInterval = 30 * 24 * 60 * 60 * 1000; // 30 days
    this.keyHistoryLimit = 5; // Keep last 5 keys for decryption
  }

  // Generate a new encryption key
  generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Get current encryption key from environment or key store
  getCurrentKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY not found in environment variables');
    }
    if (key.length !== 64) { // 32 bytes = 64 hex chars
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    return key;
  }

  // Key derivation for different purposes
  deriveKey(masterKey, purpose, salt) {
    const info = Buffer.from(purpose, 'utf8');
    return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
  }

  // Generate key for specific tenant/environment
  generateTenantKey(tenantId) {
    const masterKey = this.getCurrentKey();
    const salt = crypto.createHash('sha256').update(tenantId).digest();
    return this.deriveKey(masterKey, `tenant:${tenantId}`, salt);
  }

  // Validate key strength
  validateKey(key) {
    if (!key) return false;
    if (typeof key !== 'string') return false;
    if (key.length !== 64) return false;
    if (!/^[0-9a-fA-F]+$/.test(key)) return false;
    return true;
  }

  // Generate secure initialization vector
  generateIV() {
    return crypto.randomBytes(16);
  }

  // Generate secure salt
  generateSalt() {
    return crypto.randomBytes(32);
  }

  // Create a secure backup of keys (encrypted with a different key)
  createKeyBackup(keys, backupPassphrase) {
    const algorithm = 'aes-256-gcm';
    const backupKey = crypto.scryptSync(backupPassphrase, 'backup-salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, backupKey, iv);
    let encrypted = cipher.update(JSON.stringify(keys), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm
    };
  }

  // Restore keys from backup
  restoreKeyBackup(backup, backupPassphrase) {
    const backupKey = crypto.scryptSync(backupPassphrase, 'backup-salt', 32);
    const decipher = crypto.createDecipheriv(
      backup.algorithm,
      backupKey,
      Buffer.from(backup.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(backup.authTag, 'hex'));
    
    let decrypted = decipher.update(backup.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  // Generate secure key pair for asymmetric operations
  generateKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
  }

  // Secure key storage recommendations
  getSecurityRecommendations() {
    return {
      environment: {
        production: [
          'Use HSM (Hardware Security Module) for key storage',
          'Enable key rotation every 30 days',
          'Use separate keys per environment',
          'Implement key versioning',
          'Monitor key access and usage'
        ],
        development: [
          'Use environment variables for keys',
          'Never commit keys to version control',
          'Use different keys from production',
          'Test key rotation procedures'
        ]
      },
      infrastructure: [
        'Use AWS KMS, Azure Key Vault, or Google Cloud KMS',
        'Enable audit logging for all key operations',
        'Implement network isolation for key services',
        'Use mutual TLS for key service communication',
        'Implement key escrow for disaster recovery'
      ],
      application: [
        'Implement key caching with TTL',
        'Use derived keys for different purposes',
        'Implement graceful key rotation',
        'Never log or expose keys in application code',
        'Implement key validation and health checks'
      ]
    };
  }

  // Check if key rotation is needed
  shouldRotateKey(keyCreatedAt) {
    return Date.now() - keyCreatedAt > this.keyRotationInterval;
  }
}

export const keyManager = new KeyManager();

// Environment setup helper
export function setupSecureEnvironment() {
  const recommendations = keyManager.getSecurityRecommendations();
  
  console.log('🔐 CyberVault Security Setup');
  console.log('============================');
  console.log('');
  console.log('Current encryption status:');
  
  try {
    const currentKey = keyManager.getCurrentKey();
    const isValid = keyManager.validateKey(currentKey);
    console.log(`✓ Encryption key: ${isValid ? 'Valid' : 'Invalid'}`);
  } catch (error) {
    console.log('❌ Encryption key: Missing or invalid');
    console.log('');
    console.log('To generate a new encryption key, run:');
    console.log('node -e "console.log(\'ENCRYPTION_KEY=\' + require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  
  return recommendations;
}