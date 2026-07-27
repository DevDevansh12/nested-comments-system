'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/hooks';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAppSelector((state) => state.auth);

  useEffect(() => {
    // Wait until initializeAuth has finished before deciding where to redirect
    if (loading) return;

    if (isAuthenticated) {
      router.replace('/comments');
    } else {
      router.replace('/login');
    }
  }, [isAuthenticated, loading, router]);

  // Always show a spinner while we figure out auth state
  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 mx-auto" />
        <p className="mt-4 text-sm text-gray-600 font-medium">Loading...</p>
      </div>
    </div>
  );
}
