import { createClient } from "@supabase/supabase-js";
import { defaultProfile, profileFromEnv, assertLocalAuth } from "./local-profile.mjs";
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== "--isolated")) throw new Error("Unknown provisioning target");
const profile = process.argv[2] === "--isolated" ? profileFromEnv(process.env) : defaultProfile;
const url = assertLocalAuth(process.env.SUPABASE_URL, profile.authPort);
const client = createClient(url.toString(), process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
for (const suffix of ["", "_OTHER", "_UNBOUND"]) {
  const email = process.env[`GONGZHI_TEST${suffix}_EMAIL`], password = process.env[`GONGZHI_TEST${suffix}_PASSWORD`];
  if (!email?.endsWith("@example.invalid") || !password) throw new Error("Reserved-domain account configuration required");
  const { data, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (listError) throw new Error(`Local Auth listUsers failed (${listError.status}); values suppressed`);
  if (data.users.some(user => user.email === email)) { console.log(`Preserved local test account${suffix}`); continue; }
  const { error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Local Auth createUser failed (${error.status}); values suppressed`);
  console.log(`Created reserved-domain local test account${suffix} through GoTrue`);
}
