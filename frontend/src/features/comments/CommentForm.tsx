'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  createComment,
  addCommentOptimistic,
  rollbackOptimistic,
} from '@/store/slices/commentsSlice';
import { commentSchema, CommentFormData } from '@/utils/validation';
import { IComment } from '@/types/comment';
import toast from 'react-hot-toast';

export function CommentForm() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormData>({
    resolver: zodResolver(commentSchema),
    defaultValues: { message: '' },
  });

  const messageValue = watch('message');

  const onSubmit = async (data: CommentFormData) => {
    if (!user) return;

    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimisticComment: IComment = {
      _id: '',
      id: optimisticId,
      parentId: null,
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
    reset();

    try {
      const result = await dispatch(createComment(data)).unwrap();
      // Remove the optimistic placeholder; real comment arrived from server
      dispatch(rollbackOptimistic({ ...optimisticComment, isDeleted: true }));
      toast.success('Comment posted!');
    } catch (error: any) {
      dispatch(rollbackOptimistic({ ...optimisticComment, isDeleted: true }));
      toast.error(error || 'Failed to post comment');
    }
  };

  return (
    <div className="rounded-xl bg-white p-6 shadow-md border border-gray-200">
      <h2 className="mb-4 text-lg font-bold text-gray-900">Add a comment</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-4">
          <textarea
            {...register('message')}
            rows={4}
            className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm placeholder-gray-400 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
            placeholder="What are your thoughts?"
          />
          <div className="flex items-center justify-between mt-2">
            {errors.message ? (
              <p className="text-sm text-red-600">{errors.message.message}</p>
            ) : (
              <span />
            )}
            <span className={`text-xs font-medium ${(messageValue?.length ?? 0) > 900 ? 'text-red-500' : 'text-gray-500'}`}>
              {messageValue?.length ?? 0}/1000
            </span>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Posting…
              </>
            ) : (
              'Post Comment'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
