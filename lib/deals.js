import { resolveOrg } from './orgs';

// Turns the typed organization and contact names on a deal form into records, without loading every person into a dropdown.
export async function resolveDealLinks(s, orgName, contactName, userId) {
  const organization_id = await resolveOrg(s, orgName, userId);
  const cn = String(contactName || '').trim();
  let person_id = null;
  if (cn) {
    let q = s.from('persons').select('id').eq('name_key', cn.toLowerCase());
    q = organization_id ? q.eq('organization_id', organization_id) : q.is('organization_id', null);
    const { data: ex } = await q.limit(1);
    if (ex?.[0]) person_id = ex[0].id;
    else {
      const { data, error } = await s.from('persons').insert({ name: cn, organization_id, owner_id: userId, created_by: userId }).select('id').single();
      if (error) throw new Error(error.message);
      person_id = data.id;
    }
  }
  return { organization_id, person_id };
}
