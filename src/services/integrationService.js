import supabase from '../utils/supabaseClient.js';
import axios from 'axios';

const TABLE = 'integrations';

export async function listIntegrations() {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  return data;
}

export async function createIntegration(integration) {
  const { data, error } = await supabase.from(TABLE).insert([integration]).single();
  if (error) throw error;
  return data;
}

export async function updateIntegration(id, updates) {
  const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function deleteIntegration(id) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function sendEvent({ provider, eventType, payload }) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('provider', provider)
    .eq('enabled', true)
    .single();
  if (error) throw error;
  if (!data) throw new Error(`Integration for ${provider} not configured`);

  await axios.post(data.endpoint, { eventType, payload }, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
} 