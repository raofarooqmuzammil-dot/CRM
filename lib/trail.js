// The changes in result over time, oldest first: Interested, then Not interested.
// Repeats of the same result are collapsed into one step. `calls` can be in any order.
export function resultTrail(calls) {
  const sorted = [...calls].sort((a, b) => new Date(a.called_at) - new Date(b.called_at));
  const steps = [];
  for (const c of sorted) {
    const last = steps[steps.length - 1];
    if (last && last.outcome === c.outcome) { last.count += 1; continue; }
    steps.push({ outcome: c.outcome, at: c.called_at, by: c.caller?.full_name || '', who: c.person?.name || c.spoke_with || '', count: 1 });
  }
  return steps;
}
