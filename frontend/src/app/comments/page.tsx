'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { useSocket } from '@/hooks/useSocket';
import { fetchComments } from '@/store/slices/commentsSlice';
import { logout } from '@/store/slices/authSlice';
import { CommentList } from '@/features/comments/CommentList';
import { CommentForm } from '@/features/comments/CommentForm';
import { LoadMoreButton } from '@/features/comments/LoadMoreButton';
import { SearchBar } from '@/features/comments/SearchBar';
import { ErrorState } from '@/components/ui/ErrorState';

export default function CommentsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated, user, loading: authLoading } = useAppSelector((s) => s.auth);
  const { loading, error, roots, flatComments } = useAppSelector((s) => s.comments);
  const { connected: isConnected, syncing } = useAppSelector((s) => s.socket);

  useSocket();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { router.replace('/login'); return; }
    dispatch(fetchComments(undefined));
  }, [isAuthenticated, authLoading, dispatch, router]);

  const handleLogout = () => { dispatch(logout()); router.replace('/login'); };
  const handleRetry = () => dispatch(fetchComments(undefined));

  // Calculate total comments count - MUST be called before any early returns
  const totalComments = useMemo(() => Object.keys(flatComments).length, [flatComments]);

  const spinnerPage = (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
    </div>
  );

  if (authLoading || !isAuthenticated) return spinnerPage;

  return (
    <div className="min-h-screen bg-white">
      {/* ── System banners ────────────────────────────── */}
      {!isConnected && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          Real-time connection lost — updates may be delayed
        </div>
      )}
      {syncing && isConnected && (
        <div className="flex items-center justify-center gap-2 bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-800">
          <svg className="h-3.5 w-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Syncing missed updates…
        </div>
      )}

      {/* ── Header ────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">Comments Dashboard</h1>
              <p className="mt-0.5 text-xs text-gray-600">
                Welcome, <span className="text-blue-600 font-medium">{user?.username}</span>
              </p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
              <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-xs font-medium text-gray-700">{isConnected ? 'Live' : 'Offline'}</span>
            </div>

            {/* User avatar + logout */}
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-sm font-bold text-white select-none shadow-md">
                {user?.username.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-gray-400 hover:bg-gray-50 shadow-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────── */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
              <span className="text-2xl font-bold text-blue-600">{roots.length}</span>
              <span className="ml-2 text-sm text-gray-600">threads</span>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
              <span className="text-2xl font-bold text-blue-600">{totalComments}</span>
              <span className="ml-2 text-sm text-gray-600">total comments</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <SearchBar />
        </div>

        {/* Compose */}
        <div className="mb-8">
          <CommentForm />
        </div>

        {/* Error / list */}
        {error && !loading ? (
          <ErrorState message={error} onRetry={handleRetry} />
        ) : (
          <>
            <CommentList />
            <div className="mt-8">
              <LoadMoreButton />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
