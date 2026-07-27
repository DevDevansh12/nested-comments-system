import React, { useMemo } from 'react';

interface HighlightedTextProps {
  text: string;
  query: string;
}

export const HighlightedText = React.memo(function HighlightedText({
  text,
  query,
}: HighlightedTextProps) {
  const parts = useMemo(() => {
    if (!query.trim()) return [{ text, highlight: false }];

    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const split = text.split(regex);

    return split.map((part) => ({
      text: part,
      highlight: part.toLowerCase() === query.toLowerCase(),
    }));
  }, [text, query]);

  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
});

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
