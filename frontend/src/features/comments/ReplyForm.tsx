'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  replyToComment,
  addCommentOptimistic,
  rollbackOptimistic,
} from '@/store/slices/commentsSlice';
import { commentSchema, CommentFormData } from '@/utils/validation';
import { IComment } from '@/types/comment';
import toast from 'react-hot-toast';

interface ReplyFormProps {
  parentId: string;
  onCancel: () => void;
}

export function ReplyForm({ parentId, onCancel }: ReplyFormProps) {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormData>({
    resolver: zodResolver(commentSchema),
  });

  const onSubmit = async (data: CommentFormData) => {
    if (!user) return;

    // Optimistic comment with a temporary id
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimisticComment: IComment = {
      _id: '',
      id: optimisticId,
      parentId,
      author: { id: user._id, username: user.username },
      message: data.message,
      likes: 0,
      likedBy: [],
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      eventId: 0,
    };

    dispatch(addCommentOptimistic(optimisticComment));
    onCancel();
    reset();

    try {
      const result = await dispatch(replyToComment({ parentId, data })).unwrap();
      // Remove the optimistic placeholder now the real one is in state
      dispatch(rollbackOptimistic({ ...optimisticComment, isDeleted: true }));
      toast.success('Reply posted!');
    } catch (error: any) {
      dispatch(rollbackOptimistic({ ...optimisticComment, isDeleted: true }));
      toast.error(error || 'Failed to post reply');
    }
  };

  return (
    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-3">
          <textarea
            {...register('message')}
            rows={3}
            autoFocus
            className="block w-full rounded-lg border-gray-300 shadow-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 text-sm"
            placeholder="Write a reply…"
          />
          {errors.message && (
            <p className="mt-1 text-sm text-red-600">{errors.message.message}</p>
          )}
        </div>
        <div className="flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Posting…
              </>
            ) : (
              'Post Reply'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
