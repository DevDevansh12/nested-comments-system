export function CommentSkeleton({ depth = 0 }: { depth?: number }) {
  return (
    <div className={depth > 0 ? 'ml-6' : ''}>
      <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
        <div className="flex items-start space-x-3 mb-3">
          <div className="skeleton h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-2 w-16 rounded" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-4/5 rounded" />
          <div className="skeleton h-3 w-3/5 rounded" />
        </div>
        <div className="mt-3 flex space-x-3">
          <div className="skeleton h-5 w-10 rounded" />
          <div className="skeleton h-5 w-12 rounded" />
        </div>
      </div>
      {depth < 2 && (
        <div className="mt-2">
          <CommentSkeleton depth={depth + 1} />
        </div>
      )}
    </div>
  );
}
