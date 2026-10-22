import { addField } from '../app/actions/fields';

export default function AddColumn({ entity }) {
  return (
    <details className="panel">
      <summary><strong>+ Add column</strong></summary>
      <form className="grid" action={addField}>
        <input type="hidden" name="entity" value={entity} />
        <label>Column name<input name="name" placeholder="Website, LinkedIn, Rating..." required /></label>
        <label>Type
          <select name="type">
            <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option>
            <option value="boolean">Yes / No</option><option value="link">Link</option><option value="dropdown">Dropdown</option>
          </select>
        </label>
        <label>Dropdown choices (comma separated)<input name="options" placeholder="Only for dropdown" /></label>
        <button type="submit">Add column</button>
      </form>
    </details>
  );
}
