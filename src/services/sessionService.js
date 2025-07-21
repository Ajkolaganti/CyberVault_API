import supabase from '../utils/supabaseClient.js';
import { v4 as uuidv4 } from 'uuid';

const SESSION_TABLE = 'sessions';
const LOG_TABLE = 'session_logs';

export async function startSession({ userId, target }) {
  const session = {
    id: uuidv4(),
    user_id: userId,
    target,
    started_at: new Date().toISOString(),
    active: true,
  };
  const { data, error } = await supabase.from(SESSION_TABLE).insert([session]).single();
  if (error) throw error;
  return data;
}

export async function endSession({ sessionId, userId, role }) {
  let query = supabase
    .from(SESSION_TABLE)
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listSessions({ userId, role }) {
  let query = supabase.from(SESSION_TABLE).select('*');
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addLog({ sessionId, message }) {
  const log = {
    id: uuidv4(),
    session_id: sessionId,
    message,
    timestamp: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(LOG_TABLE).insert([log]).single();
  if (error) throw error;
  return data;
}

export async function getLogs({ sessionId }) {
  const { data, error } = await supabase
    .from(LOG_TABLE)
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
} 