import dotenv from 'dotenv';
dotenv.config();

export const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_JWT_SECRET,
  SUPABASE_SERVICE_KEY,
  JWT_SECRET,
  ENCRYPTION_KEY,
  ENCRYPTION_IV,
  PORT,
  FRONTEND_URL,
  NODE_ENV,
} = process.env; 