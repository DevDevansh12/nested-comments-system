'use client';

import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchComments } from '@/store/slices/commentsSlice';
import toast from 'react-hot-toast';

export function LoadMoreButton() {
  const dispatch = useAppDispatch();
  const { hasMore, nextCursor, loadingMore } = useAppSelector((s) => s.comments);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    try {
      await dispatch(fetchComments(nextCursor)).unwrap();
    } catch (error: any) {
      toast.error(error || 'Failed to load more comments');
    }
  }, [dispatch, nextCursor, loadingMore]);

  if (!hasMore) return null;

  return (
    <div className="flex justify-center">
      <button
        onClick={handleLoadMore}
        disabled={loadingMore}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loadingMore ? (
          <>
            <svg className="animate-spin h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading…
          </>
        ) : (
          <>
            Load more comments
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
