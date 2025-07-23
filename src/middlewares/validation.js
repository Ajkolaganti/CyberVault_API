/**
 * Request Validation Middleware
 * Validates request data against defined schemas
 */

export function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];

    // Validate body if schema.body is defined
    if (schema.body) {
      if (!req.body || typeof req.body !== 'object') {
        errors.push({
          field: 'body',
          message: 'Request body is required and must be an object'
        });
      } else {
        for (const [field, rules] of Object.entries(schema.body)) {
          const value = req.body[field];

          // Check if field is required
          if (rules.required && (value === undefined || value === null || value === '')) {
            errors.push({
              field: field,
              message: `${field} is required`
            });
            continue;
          }

          // Skip further validation if field is not provided and not required
          if (value === undefined || value === null) {
            continue;
          }

          // Type validation
          if (rules.type) {
            let isValidType = false;

            switch (rules.type) {
              case 'string':
                isValidType = typeof value === 'string';
                break;
              case 'number':
                isValidType = typeof value === 'number' && !isNaN(value);
                break;
              case 'boolean':
                isValidType = typeof value === 'boolean';
                break;
              case 'array':
                isValidType = Array.isArray(value);
                break;
              case 'object':
                isValidType = typeof value === 'object' && !Array.isArray(value);
                break;
              default:
                isValidType = true; // Unknown type, skip validation
            }

            if (!isValidType) {
              errors.push({
                field: field,
                message: `${field} must be of type ${rules.type}`
              });
              continue;
            }
          }

          // Enum validation
          if (rules.enum && Array.isArray(rules.enum)) {
            if (!rules.enum.includes(value)) {
              errors.push({
                field: field,
                message: `${field} must be one of: ${rules.enum.join(', ')}`
              });
            }
          }

          // Length validation for strings
          if (typeof value === 'string') {
            if (rules.minLength && value.length < rules.minLength) {
              errors.push({
                field: field,
                message: `${field} must be at least ${rules.minLength} characters long`
              });
            }

            if (rules.maxLength && value.length > rules.maxLength) {
              errors.push({
                field: field,
                message: `${field} must be no more than ${rules.maxLength} characters long`
              });
            }
          }

          // Array length validation
          if (Array.isArray(value)) {
            if (rules.minItems && value.length < rules.minItems) {
              errors.push({
                field: field,
                message: `${field} must contain at least ${rules.minItems} items`
              });
            }

            if (rules.maxItems && value.length > rules.maxItems) {
              errors.push({
                field: field,
                message: `${field} must contain no more than ${rules.maxItems} items`
              });
            }
          }

          // Number range validation
          if (typeof value === 'number') {
            if (rules.min !== undefined && value < rules.min) {
              errors.push({
                field: field,
                message: `${field} must be at least ${rules.min}`
              });
            }

            if (rules.max !== undefined && value > rules.max) {
              errors.push({
                field: field,
                message: `${field} must be no more than ${rules.max}`
              });
            }
          }

          // Pattern validation for strings
          if (typeof value === 'string' && rules.pattern) {
            const regex = new RegExp(rules.pattern);
            if (!regex.test(value)) {
              errors.push({
                field: field,
                message: rules.patternMessage || `${field} format is invalid`
              });
            }
          }

          // Email validation
          if (rules.email && typeof value === 'string') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              errors.push({
                field: field,
                message: `${field} must be a valid email address`
              });
            }
          }

          // UUID validation
          if (rules.uuid && typeof value === 'string') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(value)) {
              errors.push({
                field: field,
                message: `${field} must be a valid UUID`
              });
            }
          }

          // URL validation
          if (rules.url && typeof value === 'string') {
            try {
              new URL(value);
            } catch {
              errors.push({
                field: field,
                message: `${field} must be a valid URL`
              });
            }
          }
        }
      }
    }

    // Validate query parameters if schema.query is defined
    if (schema.query) {
      for (const [field, rules] of Object.entries(schema.query)) {
        const value = req.query[field];

        if (rules.required && (value === undefined || value === null || value === '')) {
          errors.push({
            field: field,
            message: `Query parameter ${field} is required`
          });
          continue;
        }

        if (value !== undefined && value !== null) {
          // Type conversion and validation for query parameters
          if (rules.type === 'number') {
            const numValue = parseInt(value);
            if (isNaN(numValue)) {
              errors.push({
                field: field,
                message: `Query parameter ${field} must be a number`
              });
            } else {
              req.query[field] = numValue; // Convert to number
            }
          }

          if (rules.type === 'boolean') {
            if (!['true', 'false'].includes(value.toLowerCase())) {
              errors.push({
                field: field,
                message: `Query parameter ${field} must be 'true' or 'false'`
              });
            } else {
              req.query[field] = value.toLowerCase() === 'true'; // Convert to boolean
            }
          }

          if (rules.enum && !rules.enum.includes(value)) {
            errors.push({
              field: field,
              message: `Query parameter ${field} must be one of: ${rules.enum.join(', ')}`
            });
          }
        }
      }
    }

    // Validate path parameters if schema.params is defined
    if (schema.params) {
      for (const [field, rules] of Object.entries(schema.params)) {
        const value = req.params[field];

        if (rules.required && (value === undefined || value === null || value === '')) {
          errors.push({
            field: field,
            message: `Path parameter ${field} is required`
          });
          continue;
        }

        if (value !== undefined && value !== null) {
          if (rules.uuid) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(value)) {
              errors.push({
                field: field,
                message: `Path parameter ${field} must be a valid UUID`
              });
            }
          }
        }
      }
    }

    // Return validation errors if any
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Request validation failed for ${errors.length} field(s)`,
        details: errors
      });
    }

    // If validation passes, continue to the next middleware
    next();
  };
}

// Common validation schemas
export const commonSchemas = {
  uuid: {
    type: 'string',
    required: true,
    uuid: true
  },
  
  email: {
    type: 'string',
    required: true,
    email: true
  },
  
  password: {
    type: 'string',
    required: true,
    minLength: 8,
    maxLength: 128
  },
  
  paginationQuery: {
    limit: {
      type: 'number',
      min: 1,
      max: 100
    },
    offset: {
      type: 'number',
      min: 0
    }
  }
};

// Validation helper functions
export function validateUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLength);
}

export function sanitizeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}