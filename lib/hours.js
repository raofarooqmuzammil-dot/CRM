export async function getHours(supabase) {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'business_hours').maybeSingle();
  const v = data?.value || {};
  return { start: Number(v.start ?? 9), end: Number(v.end ?? 17) };
}
