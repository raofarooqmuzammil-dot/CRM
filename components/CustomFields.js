const TYPES = { text: 'text', number: 'number', date: 'date', link: 'text' };

export function CustomInputs({ fields, values = {} }) {
  return fields.map((f) => {
    const name = 'cf_' + f.id;
    const v = values?.[f.id];
    if (f.type === 'boolean') {
      return <label className="check" key={f.id}><input type="checkbox" name={name} defaultChecked={Boolean(v)} /> {f.name}</label>;
    }
    if (f.type === 'dropdown') {
      return (
        <label key={f.id}>{f.name}
          <select name={name} defaultValue={v ?? ''}><option value="">Not set</option>
            {f.options.map((o) => <option key={o}>{o}</option>)}</select>
        </label>
      );
    }
    return (
      <label key={f.id}>{f.name}
        <input name={name} type={TYPES[f.type]} step={f.type === 'number' ? 'any' : undefined} defaultValue={v ?? ''} />
      </label>
    );
  });
}

export function formatValue(f, v) {
  if (v === undefined || v === null || v === '') return '';
  if (f.type === 'boolean') return v ? 'Yes' : 'No';
  if (f.type === 'link') {
    const href = /^https?:\/\//i.test(v) ? v : 'https://' + v;
    return <a href={href} target="_blank" rel="noreferrer">{v}</a>;
  }
  return String(v);
}

export function CustomValues({ fields, values }) {
  const shown = fields.filter((f) => values?.[f.id] !== undefined && values?.[f.id] !== null && values?.[f.id] !== '');
  if (!shown.length) return null;
  return <p>{shown.map((f) => <span key={f.id} className="kv"><span className="muted">{f.name}:</span> {formatValue(f, values[f.id])}</span>)}</p>;
}
