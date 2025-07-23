import crypto from 'crypto';
import { ENCRYPTION_KEY } from '../config/env.js';

const algorithm = 'aes-256-gcm';
const keyLength = 32; // 256 bits
const ivLength = 16; // 128 bits
const tagLength = 16; // 128 bits
const saltLength = 32; // 256 bits

// Derive key from master key using PBKDF2
function deriveKey(masterKey, salt) {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, keyLength, 'sha256');
}

// Encrypt with random IV and authentication tag
export function encryptField(plainText) {
  if (!plainText || plainText === null || plainText === undefined) {
    return null;
  }
  
  try {
    const masterKey = Buffer.from(ENCRYPTION_KEY, 'hex');
    const salt = crypto.randomBytes(saltLength);
    const iv = crypto.randomBytes(ivLength);
    const key = deriveKey(masterKey, salt);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(String(plainText), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    // Combine salt + iv + authTag + encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Encryption failed');
  }
}

// Decrypt with authentication verification
export function decryptField(encryptedData) {
  if (!encryptedData || encryptedData === null || encryptedData === undefined) {
    return null;
  }
  
  try {
    const masterKey = Buffer.from(ENCRYPTION_KEY, 'hex');
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, saltLength);
    const iv = combined.subarray(saltLength, saltLength + ivLength);
    const authTag = combined.subarray(saltLength + ivLength, saltLength + ivLength + tagLength);
    const encrypted = combined.subarray(saltLength + ivLength + tagLength);
    
    const key = deriveKey(masterKey, salt);
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Decryption failed or data integrity compromised');
  }
}

// Encrypt multiple fields at once
export function encryptAccountFields(accountData) {
  const fieldsToEncrypt = ['name', 'username', 'hostname_ip', 'password', 'notes'];
  const encrypted = { ...accountData };
  
  for (const field of fieldsToEncrypt) {
    if (accountData[field]) {
      encrypted[`encrypted_${field}`] = encryptField(accountData[field]);
      delete encrypted[field]; // Remove plain text
    }
  }
  
  return encrypted;
}

// Decrypt multiple fields at once
export function decryptAccountFields(encryptedData) {
  const fieldsToDecrypt = ['name', 'username', 'hostname_ip', 'password', 'notes'];
  const decrypted = { ...encryptedData };
  
  for (const field of fieldsToDecrypt) {
    const encryptedField = `encrypted_${field}`;
    if (encryptedData[encryptedField]) {
      try {
        decrypted[field] = decryptField(encryptedData[encryptedField]);
      } catch (error) {
        console.error(`Failed to decrypt ${field}:`, error);
        decrypted[field] = '[DECRYPTION_FAILED]';
      }
    }
  }
  
  return decrypted;
}

// Generate secure encryption key (run once for setup)
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Hash sensitive data for indexing (one-way, for search purposes)
export function hashForIndexing(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(String(data)).digest('hex').substring(0, 16);
}