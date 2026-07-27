'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppDispatch } from '@/hooks';
import {
  updateComment,
  updateCommentOptimistic,
  rollbackOptimistic,
} from '@/store/slices/commentsSlice';
import { setEditingComment } from '@/store/slices/uiSlice';
import { commentSchema, CommentFormData } from '@/utils/validation';
import { IComment } from '@/types/comment';
import toast from 'react-hot-toast';

interface EditFormProps {
  comment: IComment;
  onCancel: () => void;
}

export function EditForm({ comment, onCancel }: EditFormProps) {
  const dispatch = useAppDispatch();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormData>({
    resolver: zodResolver(commentSchema),
    defaultValues: { message: comment.message },
  });

  const onSubmit = async (data: CommentFormData) => {
    if (data.message === comment.message) {
      onCancel();
      return;
    }

    const snapshot = { ...comment };

    // Optimistic update
    dispatch(updateCommentOptimistic({
      ...comment,
      message: data.message,
      editedAt: new Date().toISOString(),
    }));
    dispatch(setEditingComment(null));

    try {
      await dispatch(updateComment({ id: comment.id, data })).unwrap();
      toast.success('Comment updated');
    } catch (error: any) {
      // Rollback
      dispatch(rollbackOptimistic(snapshot));
      dispatch(setEditingComment(comment.id));
      toast.error(error || 'Failed to update comment');
    }
  };

  return (
    <div className="mt-2">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-3">
          <textarea
            {...register('message')}
            rows={3}
            autoFocus
            className="block w-full rounded-lg border-gray-300 shadow-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 text-sm"
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
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
