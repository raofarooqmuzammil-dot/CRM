export default function LabelTags({ ids, labels }) {
  const byId = new Map((labels || []).map((l) => [l.id, l]));
  return (ids || []).map((id) => byId.get(id)).filter(Boolean).map((l) => (
    <span className="tag" key={l.id} style={{ background: l.color + '26', color: l.color }}>{l.name}</span>
  ));
}
