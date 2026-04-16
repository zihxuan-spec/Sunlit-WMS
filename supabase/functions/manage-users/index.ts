// Supabase Edge Function: manage-users
// 用 service_role 管理 Supabase Auth 使用者（前端 anon key 無法做到）
// Deploy: supabase functions deploy manage-users

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Input validation ────────────────────────────────────────
const VALID_ROLES = ['Admin', 'Warehouse', 'Production', 'QC', 'Facility'];
const NAME_PATTERN = /^[A-Za-z0-9 ._-]{1,40}$/;
const MIN_PASSWORD_LEN = 8;

const jsonError = (msg, status = 400) => new Response(
  JSON.stringify({ error: msg }),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. 驗證請求者是已登入的 Admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Unauthorized', 401);

    // 建立 user client（用請求者的 JWT）
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 確認是 Admin — 抓出 current user id 以供 self-delete 保護
    const { data: { user: currentUser } } = await userClient.auth.getUser();
    if (!currentUser) return jsonError('Unauthorized', 401);

    const { data: profile, error: profileErr } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single();

    if (profileErr || profile?.role !== 'Admin') {
      return jsonError('Forbidden', 403);
    }

    // 2. 用 service_role 執行用戶管理
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action, userId, name, role, password } = body;

    // Validate role / name / password where relevant
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return jsonError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    if (name !== undefined && !NAME_PATTERN.test(name)) {
      return jsonError('Invalid name (letters, digits, space, . _ - only; max 40 chars)');
    }
    if (password !== undefined && typeof password === 'string' && password.length < MIN_PASSWORD_LEN) {
      return jsonError(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
    }

    if (action === 'create') {
      if (!name || !role || !password) return jsonError('name, role, password required');
      // 建立 auth user（email = name@sunlit-wms.internal）
      const email = `${name.toLowerCase().replace(/\s+/g, '.')}@sunlit-wms.internal`;
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });
      if (createErr) throw createErr;

      // 建立 profile
      const { error: profileCreateErr } = await adminClient
        .from('profiles')
        .insert({ id: newUser.user.id, name, role });
      if (profileCreateErr) {
        // Rollback: 刪除剛建的 auth user
        await adminClient.auth.admin.deleteUser(newUser.user.id);
        throw profileCreateErr;
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_password') {
      if (!userId || !password) return jsonError('userId, password required');
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_role') {
      if (!userId || !role) return jsonError('userId, role required');
      // Prevent admin from demoting themselves (would lock out the last admin)
      if (userId === currentUser.id && role !== 'Admin') {
        return jsonError('Cannot change your own role away from Admin');
      }
      const { error } = await adminClient
        .from('profiles')
        .update({ role })
        .eq('id', userId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      if (!userId) return jsonError('userId required');
      // Prevent self-deletion
      if (userId === currentUser.id) {
        return jsonError('Cannot delete your own account');
      }
      // 刪除 auth user（cascade 會自動刪 profile）
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'list') {
      const { data, error } = await adminClient.from('profiles').select('*').order('name');
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, users: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return jsonError('Unknown action');

  } catch (err) {
    // Log full stack server-side for debugging; return only the message to client
    console.error('[manage-users] Error:', err);
    return jsonError(err?.message || 'Internal error', 500);
  }
});
