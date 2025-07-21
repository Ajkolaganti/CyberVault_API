import supabase from '../utils/supabaseClient.js';

const TABLE = 'profiles';

export async function listUsers() {
  const { data, error } = await supabase.from(TABLE).select('id, role');
  if (error) throw error;
  return data;
}

export async function updateUserRole({ userId, role }) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ role })
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
} 