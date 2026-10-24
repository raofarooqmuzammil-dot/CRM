import QuickAdd from '../../../components/QuickAdd';
import { ZONES } from '../../../lib/zones';
import { checkDuplicates, quickAdd } from '../../actions/quickadd';

export default function QuickAddPage() {
  return (
    <>
      <h1>Quick add</h1>
      <p className="muted">For a business you found on Google. Company, phone, and country are enough.</p>
      <QuickAdd zones={ZONES} checkDuplicates={checkDuplicates} quickAdd={quickAdd} />
    </>
  );
}
