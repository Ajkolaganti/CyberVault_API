import supabase from '../utils/supabaseClient.js';

const TABLE = 'access_policies';

export async function listPolicies() {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error) throw error;
  return data;
}

export async function createPolicy(policy) {
  const { data, error } = await supabase.from(TABLE).insert([policy]).single();
  if (error) throw error;
  return data;
}

export async function updatePolicy(id, updates) {
  const { data, error } = await supabase.from(TABLE).update(updates).eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function deletePolicy(id) {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).single();
  if (error) throw error;
  return data;
} 