// Supabase Edge Function: manage-users
// 用 service_role 管理 Supabase Auth 使用者（前端 anon key 無法做到）
// Deploy: supabase functions deploy manage-users

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. 驗證請求者是已登入的 Admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401 });

    // 建立 user client（用請求者的 JWT）
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 確認是 Admin
    const { data: profile, error: profileErr } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', (await userClient.auth.getUser()).data.user?.id)
      .single();

    if (profileErr || profile?.role !== 'Admin') {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    // 2. 用 service_role 執行用戶管理
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action, userId, name, role, password } = body;

    if (action === 'create') {
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
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_role') {
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

    return new Response('Unknown action', { status: 400, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
