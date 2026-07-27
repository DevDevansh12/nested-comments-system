'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { setSearchQuery, setHighlightedComment } from '@/store/slices/commentsSlice';
import { CommentNode } from '@/types/comment';

function findMatchingIds(nodes: CommentNode[], query: string): string[] {
  const q = query.toLowerCase();
  const result: string[] = [];

  function traverse(node: CommentNode): void {
    if (
      node.data.message.toLowerCase().includes(q) ||
      node.data.author.username.toLowerCase().includes(q)
    ) {
      result.push(node.data.id);
    }
    node.children.forEach(traverse);
  }

  nodes.forEach(traverse);
  return result;
}

export function SearchBar() {
  const dispatch = useAppDispatch();
  const { roots, searchQuery } = useAppSelector((state) => state.comments);

  const [localValue, setLocalValue] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalValue(val);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        dispatch(setSearchQuery(val));
      }, 300);
    },
    [dispatch]
  );

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Update matches when query or roots change
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMatchCount(0);
      setMatchIndex(0);
      setMatchIds([]);
      dispatch(setHighlightedComment(null));
      return;
    }

    const ids = findMatchingIds(roots, searchQuery);
    setMatchIds(ids);
    setMatchCount(ids.length);

    if (ids.length > 0) {
      setMatchIndex(0);
      dispatch(setHighlightedComment(ids[0]));

      // Scroll to first match
      setTimeout(() => {
        const el = document.getElementById(`comment-${ids[0]}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      dispatch(setHighlightedComment(null));
    }
  }, [searchQuery, roots, dispatch]);

  const goToMatch = useCallback(
    (direction: 1 | -1) => {
      if (matchIds.length === 0) return;
      const next = (matchIndex + direction + matchIds.length) % matchIds.length;
      setMatchIndex(next);
      dispatch(setHighlightedComment(matchIds[next]));
      setTimeout(() => {
        const el = document.getElementById(`comment-${matchIds[next]}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    },
    [matchIndex, matchIds, dispatch]
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    dispatch(setSearchQuery(''));
    dispatch(setHighlightedComment(null));
    setMatchCount(0);
    setMatchIndex(0);
    setMatchIds([]);
  }, [dispatch]);

  return (
    <div className="relative flex items-center">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder="Search comments..."
        className="block w-full rounded-lg border border-gray-300 bg-white py-3 pl-11 pr-32 text-sm shadow-sm placeholder-gray-400 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
      />

      {searchQuery && (
        <div className="absolute right-2 flex items-center space-x-1">
          <span className="text-xs text-gray-600 font-medium mr-1">
            {matchCount === 0 ? 'No matches' : `${matchIndex + 1} / ${matchCount}`}
          </span>
          <button
            onClick={() => goToMatch(-1)}
            disabled={matchCount === 0}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            aria-label="Previous match"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => goToMatch(1)}
            disabled={matchCount === 0}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            aria-label="Next match"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={handleClear}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Clear search"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
