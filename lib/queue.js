import { zonesInHours } from './zones';

// Asks the database for the next never-called organization and holds it for this caller for 10 minutes.
// `list` is a list id, "none" for organizations without a list, or empty for all lists. `skip` is the one to move away from.
export async function claimNext(s, { list, hoursOnly, hours, skip, now }) {
  const args = { p_list: null, p_no_list: false, p_zones: null, p_skip: skip || null };
  if (list === 'none') args.p_no_list = true; else if (list) args.p_list = list;
  if (hoursOnly) { const z = zonesInHours(hours, now); args.p_zones = z.length ? z : ['none']; }
  const { data, error } = await s.rpc('claim_next_org', args);
  if (error) throw new Error(error.message);
  return data || null;
}
