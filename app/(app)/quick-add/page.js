import QuickAdd from '../../../components/QuickAdd';
import { getClient } from '../../../lib/supabase/server';
import { ZONES } from '../../../lib/zones';
import { checkDuplicates, quickAdd } from '../../actions/quickadd';

export default async function QuickAddPage() {
  const { data: lists } = await getClient().from('lists').select('id, name').order('name');
  return (
    <>
      <h1>Quick add</h1>
      <p className="muted">For a business you found on Google. Company, phone, and country are enough. It creates an organization.</p>
      <QuickAdd zones={ZONES} lists={lists || []} checkDuplicates={checkDuplicates} quickAdd={quickAdd} />
    </>
  );
}
