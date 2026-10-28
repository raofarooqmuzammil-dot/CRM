// Reads the "Who did you speak to?" part of the organization call form.
// "who" is one of: "" (not sure), "role:Manager", "contact:<id>", or "new" (a contact created while logging).
export function parseWho(get) {
  const who = String(get('who') || '');
  const askName = String(get('spoke_name') || '').trim();
  if (who.startsWith('contact:')) return { contactId: who.slice(8), newContact: null, spokeWith: null };
  if (who === 'new') {
    const name = String(get('new_name') || '').trim();
    if (!name) throw new Error('Enter the contact name');
    return {
      contactId: null, spokeWith: null,
      newContact: { name, role: String(get('new_role') || '').trim() || null, phone: String(get('new_phone') || '').trim() || null },
    };
  }
  if (who.startsWith('role:')) return { contactId: null, newContact: null, spokeWith: [who.slice(5), askName].filter(Boolean).join(' ') };
  return { contactId: null, newContact: null, spokeWith: askName || null };
}
