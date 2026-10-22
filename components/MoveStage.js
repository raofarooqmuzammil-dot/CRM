'use client';

// A stage dropdown that moves the deal as soon as you pick a stage.
export default function MoveStage({ action, dealId, stages, current }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={dealId} />
      <select name="stage_id" defaultValue={current} aria-label="Move to stage"
        onChange={(e) => e.currentTarget.form.requestSubmit()}>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </form>
  );
}
