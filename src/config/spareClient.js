import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Use sessionStorage instead of localStorage to avoid Edge tracking prevention
// blocking third-party storage access
const storage = {
  getItem:    (key) => { try { return sessionStorage.getItem(key); } catch { return null; } },
  setItem:    (key, val) => { try { sessionStorage.setItem(key, val); } catch {} },
  removeItem: (key) => { try { sessionStorage.removeItem(key); } catch {} },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage, storageKey: 'wms-auth', autoRefreshToken: true, persistSession: true },
});

export const spareSupabase = supabase;
