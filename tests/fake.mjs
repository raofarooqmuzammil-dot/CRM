const ALLOWED = {
  organizations: 'id name address website phone email notes country time_zone time_zone_guessed labels owner_id visible_to created_by created_at updated_at label_ids custom import_batch_id list_id do_not_call call_count last_called_at last_outcome last_called_by possible_duplicate duplicate_of_org duplicate_of_person phone_key name_key email_key',
  persons: 'id name organization_id phone email labels owner_id visible_to do_not_call notes created_by created_at updated_at label_ids call_count last_called_at last_outcome last_called_by custom import_batch_id phone_key email_key name_key possible_duplicate duplicate_of duplicate_of_org time_zone time_zone_guessed eff_time_zone',
  pipelines: 'id name sort', stages: 'id pipeline_id name sort', deals: 'id title organization_id person_id pipeline_id stage_id owner_id phone email source_channel created_by status value currency', profiles: 'id full_name role disabled', activities: 'id title type due_at done organization_id person_id assigned_to created_by', labels: 'id name color', lists: 'id name color sort', custom_fields: 'id entity name type options sort hidden', import_batches: 'id file_name stats created_by',
};
export function makeFake() {
  const db = { profiles: [], activities: [], organizations: [], persons: [], labels: [], lists: [], pipelines: [], stages: [], deals: [], custom_fields: [], import_batches: [] };
  let n = 0;
  const keys = (t, r) => {
    if (t === 'persons') { const d = (r.phone || '').replace(/\D/g, ''); r.phone_key = d ? d.slice(-9) : null; const e = (r.email || '').trim().toLowerCase(); r.email_key = e || null; r.name_key = (r.name || '').trim().toLowerCase(); }
    if (t === 'organizations') { const d = (r.phone || '').replace(/\D/g, ''); r.phone_key = d ? d.slice(-9) : null; r.name_key = (r.name || '').trim().toLowerCase(); const e = (r.email || '').trim().toLowerCase(); r.email_key = e || null; }
  };
  const check = (t, o) => { for (const k of Object.keys(o)) if (!ALLOWED[t].split(' ').includes(k)) throw new Error(`Could not find the '${k}' column of '${t}' in the schema cache`); };
  const from = (t) => {
    const st = { filters: [], op: 'select', sel: false, single: false, lim: null, orders: [], count: false };
    const b = {
      select(_c, o) { st.sel = true; if (o?.count) st.count = true; return b; },
      is(c, v) { st.filters.push((r) => (r[c] ?? null) === v); return b; },
      not(c, op, v) { if (op === 'is') st.filters.push((r) => (r[c] ?? null) !== v); else { const list = [...String(v).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"')); st.filters.push((r) => !list.includes(r[c])); } return b; },
      gte(c, v) { st.filters.push((r) => r[c] >= v); return b; },
      order(c, o) { st.orders.push([c, o?.ascending !== false, o?.nullsFirst]); return b; }, in(c, v) { st.filters.push((r) => v.includes(r[c])); return b; },
      eq(c, v) { st.filters.push((r) => r[c] === v); return b; }, ilike(c, v) { st.filters.push((r) => String(r[c]).toLowerCase() === v.toLowerCase()); return b; },
      limit(x) { st.lim = x; return b; }, single() { st.single = true; return b; }, maybeSingle() { st.single = true; return b; },
      insert(p) { st.op = 'insert'; st.p = p; return b; }, update(p) { st.op = 'update'; st.p = p; return b; }, delete() { st.op = 'delete'; return b; },
      then(res, rej) {
        try {
          let out = null; let total;
          const rows = () => db[t].filter((r) => st.filters.every((f) => f(r)));
          if (st.op === 'insert') {
            const arr = Array.isArray(st.p) ? st.p : [st.p]; const made = [];
            for (const o of arr) { check(t, o); const r = { id: t + '-' + (++n), ...JSON.parse(JSON.stringify(o)) }; if (t === 'deals' && !r.status) r.status = 'open'; keys(t, r); db[t].push(r); made.push(r); }
            out = st.sel ? made : null;
          } else if (st.op === 'update') { check(t, st.p); const hit = rows(); hit.forEach((r) => { Object.assign(r, st.p); keys(t, r); }); out = st.sel ? hit : null; }
          else if (st.op === 'delete') db[t] = db[t].filter((r) => !st.filters.every((f) => f(r)));
          else { out = rows(); total = out.length; for (const [c, asc, nf] of [...st.orders].reverse()) out = [...out].sort((x, y) => { const xn = x[c] == null, yn = y[c] == null; if (xn || yn) return xn === yn ? 0 : (xn ? -1 : 1) * (nf ? 1 : -1); return ((x[c] < y[c]) ? -1 : (x[c] > y[c]) ? 1 : 0) * (asc ? 1 : -1); }); if (st.lim) out = out.slice(0, st.lim); }
          if (st.single && Array.isArray(out)) out = out[0];
          res({ data: out, error: null, count: st.count ? total : undefined });
        } catch (e) { res({ data: null, error: { message: e.message } }); }
      },
    };
    return b;
  };
  return { db, from, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } };
}
