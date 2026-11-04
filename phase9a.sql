-- Phase 9a: follow-ups can belong to a deal. Run once in Supabase > SQL Editor, after the earlier files.
alter table activities add column deal_id uuid references deals(id) on delete cascade;
create index activities_deal_idx on activities (deal_id);

-- A deal's follow-up also counts as the organization's (so it shows on the organization page and sorts by next follow-up)
create or replace function activities_fill_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is null and new.person_id is not null then
    select organization_id into new.organization_id from persons where id = new.person_id;
  end if;
  if new.organization_id is null and new.deal_id is not null then
    select organization_id into new.organization_id from deals where id = new.deal_id;
  end if;
  return new;
end $$;

drop policy "see own or visible" on activities;
create policy "see own or visible" on activities for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or is_admin()
         or exists (select 1 from persons p where p.id = person_id)
         or exists (select 1 from organizations o where o.id = organization_id)
         or exists (select 1 from deals d where d.id = deal_id));
