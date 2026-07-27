'use client';

import React, { useMemo } from 'react';
import { useAppSelector } from '@/hooks';
import { CommentItem } from './CommentItem';
import { CommentSkeleton } from './CommentSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export const CommentList = React.memo(function CommentList() {
  const { roots, loading, searchQuery } = useAppSelector((s) => s.comments);

  // Decide whether any root passes the search filter
  const visibleRoots = useMemo(() => {
    if (!searchQuery.trim()) return roots;
    const q = searchQuery.toLowerCase();

    function nodeMatches(node: (typeof roots)[number]): boolean {
      if (
        node.data.message.toLowerCase().includes(q) ||
        node.data.author.username.toLowerCase().includes(q)
      )
        return true;
      return node.children.some(nodeMatches);
    }

    return roots.filter(nodeMatches);
  }, [roots, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CommentSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (visibleRoots.length === 0) {
    return (
      <EmptyState
        title={searchQuery ? 'No matching comments' : 'No comments yet'}
        description={
          searchQuery
            ? `No comments match "${searchQuery}"`
            : 'Be the first to share your thoughts!'
        }
        icon={
          <svg
            className="h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {visibleRoots.map((node) => (
        <CommentItem key={node.data.id} node={node} depth={0} />
      ))}
    </div>
  );
});
