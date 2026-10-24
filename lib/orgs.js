// Finds an organization by exact name (ignoring case) or creates it.
export async function resolveOrg(s, name, userId) {
  const n = String(name || '').trim();
  if (!n) return null;
  const { data: ex } = await s.from('organizations').select('id').eq('name_key', n.toLowerCase()).limit(1);
  if (ex?.[0]) return ex[0].id;
  const { data, error } = await s.from('organizations').insert({ name: n, owner_id: userId, created_by: userId }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}
