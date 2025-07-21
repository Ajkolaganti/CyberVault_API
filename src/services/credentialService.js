import { supabaseAdmin } from '../utils/supabaseClient.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const TABLE = 'credentials';

export async function createCredential({ userId, type, name, value }) {
  const encryptedValue = encrypt(value);
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert([
      { user_id: userId, type, name, value: encryptedValue },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCredentials({ userId, role }) {
  console.log(`Fetching credentials for userId: ${userId}, role: ${role}`);
  
  let query = supabaseAdmin.from(TABLE).select('*');
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Database error fetching credentials:', error);
    throw error;
  }
  
  console.log(`Found ${data ? data.length : 0} credentials in database`);
  
  if (!data || data.length === 0) {
    return [];
  }
  
  try {
    return data.map((cred) => ({ 
      ...cred, 
      value: decrypt(cred.value) 
    }));
  } catch (decryptError) {
    console.error('Decryption error:', decryptError);
    throw new Error('Failed to decrypt credential values');
  }
}

export async function getCredentialById({ id, userId, role }) {
  let query = supabaseAdmin.from(TABLE).select('*').eq('id', id).single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return { ...data, value: decrypt(data.value) };
}

export async function updateCredential({ id, userId, role, updates }) {
  if (updates.value) {
    updates.value = encrypt(updates.value);
  }
  let query = supabaseAdmin.from(TABLE).update(updates).eq('id', id).single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function deleteCredential({ id, userId, role }) {
  let query = supabaseAdmin.from(TABLE).delete().eq('id', id).single();
  if (role === 'User') {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
} 