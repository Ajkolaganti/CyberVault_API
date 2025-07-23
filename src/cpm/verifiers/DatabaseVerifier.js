/**
 * Database Credential Verifier
 * Verifies database credentials across multiple database types
 */

import mysql from 'mysql2/promise';
import pg from 'pg';
import { MongoClient } from 'mongodb';
import { logger } from '../utils/logger.js';
import { decrypt } from '../../utils/encryption.js';

// Optional Oracle support - only load if available
let oracledb = null;
try {
  oracledb = await import('oracledb');
} catch (error) {
  logger.warn('Oracle DB support not available - oracledb package not installed');
}

export class DatabaseVerifier {
  constructor(config) {
    this.config = config;
    this.timeout = config.get('databaseTimeout') || config.get('verificationTimeout');
  }
  
  /**
   * Verify database credential
   * @param {Object} credential - Credential object from database
   * @returns {Promise<Object>} Verification result
   */
  async verify(credential) {
    const startTime = Date.now();
    logger.info(`🗄️ Verifying Database credential: ${credential.id} (${credential.name})`);
    
    try {
      // Decrypt the credential value
      const decryptedValue = decrypt(credential.value);
      let connectionConfig;
      
      try {
        connectionConfig = JSON.parse(decryptedValue);
      } catch (parseError) {
        // If not JSON, treat as plain password with connection info from credential record
        connectionConfig = {
          password: decryptedValue,
          host: credential.host,
          port: credential.port,
          username: credential.username,
          database: credential.database || 'test',
          type: this.inferDatabaseType(credential.port)
        };
      }
      
      // Validate required fields
      if (!connectionConfig.host || !connectionConfig.username || !connectionConfig.password) {
        throw new Error('Missing required database connection parameters (host, username, password)');
      }
      
      // Determine database type
      const dbType = (connectionConfig.type || this.inferDatabaseType(connectionConfig.port)).toLowerCase();
      
      logger.debug(`Attempting ${dbType} connection: ${connectionConfig.username}@${connectionConfig.host}:${connectionConfig.port}`);
      
      let verificationResult;
      
      // Route to appropriate database verifier
      switch (dbType) {
        case 'mysql':
        case 'mariadb':
          verificationResult = await this.verifyMySQL(connectionConfig);
          break;
        case 'postgresql':
        case 'postgres':
          verificationResult = await this.verifyPostgreSQL(connectionConfig);
          break;
        case 'mongodb':
        case 'mongo':
          verificationResult = await this.verifyMongoDB(connectionConfig);
          break;
        case 'oracle':
          verificationResult = await this.verifyOracle(connectionConfig);
          break;
        case 'mssql':
        case 'sqlserver':
          verificationResult = await this.verifySQLServer(connectionConfig);
          break;
        case 'redis':
          verificationResult = await this.verifyRedis(connectionConfig);
          break;
        default:
          // Try to auto-detect based on port
          verificationResult = await this.verifyAutoDetect(connectionConfig);
      }
      
      const duration = Date.now() - startTime;
      logger.performance('Database verification', duration, {
        credentialId: credential.id,
        host: connectionConfig.host,
        port: connectionConfig.port,
        username: connectionConfig.username,
        dbType: dbType
      });
      
      if (verificationResult.success) {
        logger.info(`✅ Database credential verified successfully: ${credential.id}`);
      } else {
        logger.warn(`⚠️ Database credential verification failed: ${credential.id} - ${verificationResult.message}`);
      }
      
      return {
        ...verificationResult,
        details: {
          ...verificationResult.details,
          host: connectionConfig.host,
          port: connectionConfig.port,
          username: connectionConfig.username,
          database: connectionConfig.database,
          dbType: dbType,
          connectionTime: duration
        }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`❌ Database verification failed for ${credential.id}:`, error.message);
      
      return this.createErrorResult(error, credential, duration);
    }
  }
  
  /**
   * Verify MySQL/MariaDB connection
   */
  async verifyMySQL(config) {
    let connection = null;
    
    try {
      const connectionConfig = {
        host: config.host,
        port: config.port || 3306,
        user: config.username,
        password: config.password,
        database: config.database || 'information_schema',
        connectTimeout: this.timeout,
        acquireTimeout: this.timeout,
        ssl: config.ssl || false
      };
      
      connection = await mysql.createConnection(connectionConfig);
      
      // Test query
      const [rows] = await connection.execute('SELECT VERSION() as version, USER() as user');
      
      await connection.end();
      
      return {
        success: true,
        message: 'MySQL connection successful',
        details: {
          dbType: 'mysql',
          version: rows[0]?.version || 'unknown',
          connectedUser: rows[0]?.user || config.username,
          database: config.database || 'information_schema'
        }
      };
      
    } catch (error) {
      if (connection) {
        try { await connection.end(); } catch {}
      }
      
      return this.categorizeDBError(error, 'mysql');
    }
  }
  
  /**
   * Verify PostgreSQL connection
   */
  async verifyPostgreSQL(config) {
    const client = new pg.Client({
      host: config.host,
      port: config.port || 5432,
      user: config.username,
      password: config.password,
      database: config.database || 'postgres',
      connectionTimeoutMillis: this.timeout,
      ssl: config.ssl || false
    });
    
    try {
      await client.connect();
      
      // Test query
      const result = await client.query('SELECT version(), current_user, current_database()');
      
      await client.end();
      
      return {
        success: true,
        message: 'PostgreSQL connection successful',
        details: {
          dbType: 'postgresql',
          version: result.rows[0]?.version?.split(' ')[1] || 'unknown',
          connectedUser: result.rows[0]?.current_user || config.username,
          database: result.rows[0]?.current_database || config.database
        }
      };
      
    } catch (error) {
      try { await client.end(); } catch {}
      return this.categorizeDBError(error, 'postgresql');
    }
  }
  
  /**
   * Verify MongoDB connection
   */
  async verifyMongoDB(config) {
    let client = null;
    
    try {
      const uri = config.uri || `mongodb://${config.username}:${config.password}@${config.host}:${config.port || 27017}/${config.database || 'admin'}`;
      
      client = new MongoClient(uri, {
        connectTimeoutMS: this.timeout,
        serverSelectionTimeoutMS: this.timeout,
        socketTimeoutMS: this.timeout
      });
      
      await client.connect();
      
      // Test query
      const admin = client.db().admin();
      const serverStatus = await admin.serverStatus();
      
      await client.close();
      
      return {
        success: true,
        message: 'MongoDB connection successful',
        details: {
          dbType: 'mongodb',
          version: serverStatus.version || 'unknown',
          host: serverStatus.host || config.host,
          database: config.database || 'admin'
        }
      };
      
    } catch (error) {
      if (client) {
        try { await client.close(); } catch {}
      }
      
      return this.categorizeDBError(error, 'mongodb');
    }
  }
  
  /**
   * Verify Oracle connection
   */
  async verifyOracle(config) {
    let connection = null;
    
    try {
      // Check if Oracle support is available
      if (!oracledb) {
        throw new Error('Oracle DB support not available - oracledb package not installed');
      }
      
      const connectionConfig = {
        user: config.username,
        password: config.password,
        connectString: config.connectString || `${config.host}:${config.port || 1521}/${config.serviceName || config.database || 'XE'}`,
        connectTimeout: Math.floor(this.timeout / 1000) // Oracle uses seconds
      };
      
      connection = await oracledb.getConnection(connectionConfig);
      
      // Test query
      const result = await connection.execute('SELECT banner FROM v$version WHERE ROWNUM = 1');
      
      await connection.close();
      
      return {
        success: true,
        message: 'Oracle connection successful',
        details: {
          dbType: 'oracle',
          version: result.rows[0]?.[0] || 'unknown',
          serviceName: config.serviceName || config.database,
          connectString: connectionConfig.connectString
        }
      };
      
    } catch (error) {
      if (connection) {
        try { await connection.close(); } catch {}
      }
      
      return this.categorizeDBError(error, 'oracle');
    }
  }
  
  /**
   * Verify SQL Server connection (requires mssql package)
   */
  async verifySQLServer(config) {
    try {
      // Dynamic import since mssql might not be installed
      const sql = await import('mssql');
      
      const connectionConfig = {
        server: config.host,
        port: config.port || 1433,
        user: config.username,
        password: config.password,
        database: config.database || 'master',
        connectionTimeout: this.timeout,
        requestTimeout: this.timeout,
        options: {
          encrypt: config.encrypt || false,
          trustServerCertificate: config.trustServerCertificate || true
        }
      };
      
      const pool = new sql.ConnectionPool(connectionConfig);
      await pool.connect();
      
      // Test query
      const result = await pool.request().query('SELECT @@VERSION as version, SUSER_NAME() as user');
      
      await pool.close();
      
      return {
        success: true,
        message: 'SQL Server connection successful',
        details: {
          dbType: 'sqlserver',
          version: result.recordset[0]?.version?.split(' ')[3] || 'unknown',
          connectedUser: result.recordset[0]?.user || config.username,
          database: config.database || 'master'
        }
      };
      
    } catch (error) {
      if (error.message.includes('Cannot resolve module')) {
        return {
          success: false,
          message: 'SQL Server verification not available - mssql package not installed',
          errorCategory: 'dependency_missing',
          details: { dbType: 'sqlserver' }
        };
      }
      
      return this.categorizeDBError(error, 'sqlserver');
    }
  }
  
  /**
   * Verify Redis connection
   */
  async verifyRedis(config) {
    try {
      // Dynamic import since redis might not be installed
      const redis = await import('redis');
      
      const client = redis.createClient({
        host: config.host,
        port: config.port || 6379,
        password: config.password,
        connectTimeout: this.timeout,
        commandTimeout: this.timeout,
        db: config.database || 0
      });
      
      await client.connect();
      
      // Test commands
      const info = await client.info('server');
      const ping = await client.ping();
      
      await client.disconnect();
      
      const version = info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown';
      
      return {
        success: true,
        message: 'Redis connection successful',
        details: {
          dbType: 'redis',
          version: version,
          ping: ping,
          database: config.database || 0
        }
      };
      
    } catch (error) {
      if (error.message.includes('Cannot resolve module')) {
        return {
          success: false,
          message: 'Redis verification not available - redis package not installed',
          errorCategory: 'dependency_missing',
          details: { dbType: 'redis' }
        };
      }
      
      return this.categorizeDBError(error, 'redis');
    }
  }
  
  /**
   * Auto-detect database type and verify
   */
  async verifyAutoDetect(config) {
    const port = parseInt(config.port);
    const detectionOrder = [];
    
    // Determine likely database types based on port
    switch (port) {
      case 3306:
        detectionOrder.push('mysql');
        break;
      case 5432:
        detectionOrder.push('postgresql');
        break;
      case 27017:
        detectionOrder.push('mongodb');
        break;
      case 1521:
        detectionOrder.push('oracle');
        break;
      case 1433:
        detectionOrder.push('sqlserver');
        break;
      case 6379:
        detectionOrder.push('redis');
        break;
      default:
        detectionOrder.push('mysql', 'postgresql', 'mongodb');
    }
    
    let lastError = null;
    
    for (const dbType of detectionOrder) {
      try {
        logger.debug(`Auto-detecting database type: trying ${dbType}`);
        
        const tempConfig = { ...config, type: dbType };
        let result;
        
        switch (dbType) {
          case 'mysql':
            result = await this.verifyMySQL(tempConfig);
            break;
          case 'postgresql':
            result = await this.verifyPostgreSQL(tempConfig);
            break;
          case 'mongodb':
            result = await this.verifyMongoDB(tempConfig);
            break;
          case 'oracle':
            result = await this.verifyOracle(tempConfig);
            break;
          case 'sqlserver':
            result = await this.verifySQLServer(tempConfig);
            break;
          case 'redis':
            result = await this.verifyRedis(tempConfig);
            break;
        }
        
        if (result.success) {
          return {
            ...result,
            message: `${result.message} (auto-detected as ${dbType})`,
            details: {
              ...result.details,
              autoDetected: true,
              detectionOrder: detectionOrder
            }
          };
        }
        
        lastError = result;
        
      } catch (error) {
        logger.debug(`Auto-detection failed for ${dbType}:`, error.message);
        lastError = {
          success: false,
          message: error.message,
          errorCategory: 'connection',
          details: { dbType: dbType }
        };
      }
    }
    
    // All detection attempts failed
    return {
      success: false,
      message: `Database auto-detection failed. Tried: ${detectionOrder.join(', ')}. Last error: ${lastError?.message || 'Unknown error'}`,
      errorCategory: lastError?.errorCategory || 'connection',
      details: {
        autoDetected: false,
        detectionOrder: detectionOrder,
        lastError: lastError
      }
    };
  }
  
  /**
   * Categorize database errors
   */
  categorizeDBError(error, dbType) {
    let errorCategory = 'unknown';
    let userFriendlyMessage = error.message;
    
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('timeout') || errorMsg.includes('etimedout')) {
      errorCategory = 'timeout';
      userFriendlyMessage = `Database connection timeout - ${dbType} server may be slow or unreachable`;
    } else if (errorMsg.includes('econnrefused') || errorMsg.includes('connection refused')) {
      errorCategory = 'connection_refused';
      userFriendlyMessage = `Connection refused - ${dbType} service may not be running`;
    } else if (errorMsg.includes('enotfound') || errorMsg.includes('host not found')) {
      errorCategory = 'host_not_found';
      userFriendlyMessage = 'Database host not found - check hostname/IP address';
    } else if (errorMsg.includes('authentication') || errorMsg.includes('access denied') || 
               errorMsg.includes('login failed') || errorMsg.includes('invalid credentials')) {
      errorCategory = 'authentication';
      userFriendlyMessage = 'Database authentication failed - check username/password';
    } else if (errorMsg.includes('database') && errorMsg.includes('does not exist')) {
      errorCategory = 'database_not_found';
      userFriendlyMessage = 'Database does not exist - check database name';
    } else if (errorMsg.includes('ssl') || errorMsg.includes('certificate')) {
      errorCategory = 'ssl_error';
      userFriendlyMessage = 'SSL/TLS error - check certificate configuration';
    }
    
    return {
      success: false,
      message: userFriendlyMessage,
      error: error.message,
      errorCategory,
      details: {
        dbType: dbType,
        originalError: error.code || error.name
      }
    };
  }
  
  /**
   * Infer database type from port number
   */
  inferDatabaseType(port) {
    const portMap = {
      3306: 'mysql',
      5432: 'postgresql',
      27017: 'mongodb',
      1521: 'oracle',
      1433: 'sqlserver',
      6379: 'redis'
    };
    
    return portMap[parseInt(port)] || 'mysql'; // Default to mysql
  }
  
  /**
   * Create error result with categorization
   */
  createErrorResult(error, credential, duration) {
    let errorCategory = 'unknown';
    let userFriendlyMessage = error.message;
    
    if (error.message.includes('timeout')) {
      errorCategory = 'timeout';
      userFriendlyMessage = 'Database connection timeout';
    } else if (error.message.includes('parameters')) {
      errorCategory = 'configuration';
      userFriendlyMessage = 'Invalid database connection parameters';
    }
    
    return {
      success: false,
      message: userFriendlyMessage,
      error: error.message,
      errorCategory,
      details: {
        host: credential.host,
        port: credential.port,
        username: credential.username,
        connectionTime: duration,
        errorType: error.constructor.name
      }
    };
  }
  
  /**
   * Validate database credential format
   */
  validateCredential(credential) {
    const errors = [];
    
    try {
      const decryptedValue = decrypt(credential.value);
      let connectionConfig;
      
      try {
        connectionConfig = JSON.parse(decryptedValue);
      } catch {
        // Plain password - need additional info from credential record
        if (!credential.host || !credential.username) {
          errors.push('Missing host or username for database credential');
        }
        return { valid: errors.length === 0, errors };
      }
      
      // Validate JSON format
      if (!connectionConfig.host && !credential.host) {
        errors.push('Missing host parameter');
      }
      
      if (!connectionConfig.username && !credential.username) {
        errors.push('Missing username parameter');
      }
      
      if (!connectionConfig.password) {
        errors.push('Missing password parameter');
      }
      
      if (connectionConfig.port && (isNaN(connectionConfig.port) || connectionConfig.port < 1 || connectionConfig.port > 65535)) {
        errors.push('Invalid port number');
      }
      
      const validTypes = ['mysql', 'postgresql', 'mongodb', 'oracle', 'sqlserver', 'redis', 'mariadb'];
      if (connectionConfig.type && !validTypes.includes(connectionConfig.type.toLowerCase())) {
        errors.push(`Invalid database type (must be one of: ${validTypes.join(', ')})`);
      }
      
    } catch (error) {
      errors.push(`Failed to decrypt or parse credential: ${error.message}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Check database driver dependencies
   */
  static async checkDependencies() {
    const dependencies = [
      { name: 'mysql2', purpose: 'MySQL/MariaDB verification', required: true },
      { name: 'pg', purpose: 'PostgreSQL verification', required: true },
      { name: 'mongodb', purpose: 'MongoDB verification', required: false },
      { name: 'oracledb', purpose: 'Oracle verification', required: false },
      { name: 'mssql', purpose: 'SQL Server verification', required: false },
      { name: 'redis', purpose: 'Redis verification', required: false }
    ];
    
    const results = [];
    
    for (const dep of dependencies) {
      try {
        await import(dep.name);
        results.push({ ...dep, available: true });
      } catch {
        results.push({ ...dep, available: false });
      }
    }
    
    return results;
  }
}