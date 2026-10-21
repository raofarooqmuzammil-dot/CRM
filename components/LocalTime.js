'use client';
import { useEffect, useState } from 'react';

// Shows a timestamp in the viewer's own time zone.
export default function LocalTime({ iso }) {
  const [text, setText] = useState('');
  useEffect(() => {
    setText(new Date(iso).toLocaleString([], {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    }));
  }, [iso]);
  return <span>{text}</span>;
}
