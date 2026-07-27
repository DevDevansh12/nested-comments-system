'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  deleteComment,
  toggleLike,
  deleteCommentOptimistic,
  toggleLikeOptimistic,
  rollbackOptimistic,
  updateCommentOptimistic,
} from '@/store/slices/commentsSlice';
import { setReplyingTo, setEditingComment } from '@/store/slices/uiSlice';
import { CommentNode, IComment } from '@/types/comment';
import { formatDate, formatFullDate } from '@/utils/formatDate';
import { ReplyForm } from './ReplyForm';
import { EditForm } from './EditForm';
import { HighlightedText } from '@/components/ui/HighlightedText';
import toast from 'react-hot-toast';

interface CommentItemProps {
  node: CommentNode;
  depth: number;
}

const MAX_VISIBLE_DEPTH = 8;
const INDENT_PX = 24;

export const CommentItem = React.memo(function CommentItem({ node, depth }: CommentItemProps) {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { replyingTo, editingComment } = useAppSelector((state) => state.ui);
  const { searchQuery, highlightedCommentId } = useAppSelector((state) => state.comments);

  const [childrenVisible, setChildrenVisible] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const comment = node.data;
  const isOwner = user?._id === comment.author.id;
  const isReplying = replyingTo === comment.id;
  const isEditing = editingComment === comment.id;
  const isHighlighted = highlightedCommentId === comment.id;

  const hasLiked = useMemo(
    () => user ? (comment.likedBy ?? []).includes(user._id) : false,
    [comment.likedBy, user]
  );

  // Edit window: 5 minutes from creation — recomputed on each render (cheap)
  const canEdit = isOwner && !comment.isDeleted
    ? Date.now() - new Date(comment.createdAt).getTime() <= 5 * 60 * 1000
    : false;

  // Check if this comment or any descendant matches search
  const matchesSearch = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const checkNode = (n: CommentNode): boolean => {
      if (n.data.message.toLowerCase().includes(q)) return true;
      if (n.data.author.username.toLowerCase().includes(q)) return true;
      return n.children.some(checkNode);
    };
    return checkNode(node);
  }, [searchQuery, node]);

  const handleReply = useCallback(() => {
    dispatch(setReplyingTo(isReplying ? null : comment.id));
  }, [dispatch, isReplying, comment.id]);

  const handleEdit = useCallback(() => {
    dispatch(setEditingComment(isEditing ? null : comment.id));
  }, [dispatch, isEditing, comment.id]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm('Delete this comment?')) return;

    // Deep-copy the snapshot so rollback has an independent copy
    const snapshot: IComment = {
      ...comment,
      likedBy: [...comment.likedBy],
    };
    setIsDeleting(true);

    // Optimistic update
    dispatch(deleteCommentOptimistic(comment.id));

    try {
      await dispatch(deleteComment(comment.id)).unwrap();
      toast.success('Comment deleted');
    } catch (error: any) {
      // Rollback
      dispatch(rollbackOptimistic(snapshot));
      toast.error(error || 'Failed to delete comment');
    } finally {
      setIsDeleting(false);
    }
  }, [dispatch, comment]);

  const handleLike = useCallback(async () => {
    if (!user) {
      toast.error('Please log in to like comments');
      return;
    }

    const snapshot: IComment = {
      ...comment,
      likedBy: [...(comment.likedBy ?? [])],
    };

    // Optimistic update
    dispatch(toggleLikeOptimistic({ id: comment.id, userId: user._id, liked: !hasLiked }));

    try {
      await dispatch(toggleLike(comment.id)).unwrap();
    } catch (error: any) {
      // Rollback
      dispatch(rollbackOptimistic(snapshot));
      toast.error(error || 'Failed to update like');
    }
  }, [dispatch, comment, user, hasLiked]);

  const toggleChildren = useCallback(() => {
    setChildrenVisible((v) => !v);
  }, []);

  // Hide if doesn't match search
  if (!matchesSearch) return null;

  const indentLevel = Math.min(depth, MAX_VISIBLE_DEPTH);
  const indentStyle = depth > 0 ? { marginLeft: `${Math.min(indentLevel, 6) * INDENT_PX}px` } : {};

  return (
    <div className="animate-fade-in">
      <div
        id={`comment-${comment.id}`}
        style={indentStyle}
        className={`relative ${isHighlighted ? 'ring-2 ring-blue-400 rounded-lg' : ''}`}
      >
        {/* Thread line for nested comments */}
        {depth > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-300 -ml-3"
            aria-hidden="true"
          />
        )}

        <div className={`rounded-lg bg-white p-4 shadow-md border border-gray-200 ${comment.isDeleted ? 'opacity-60' : ''}`}>
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-2">
              {/* Avatar */}
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 text-sm font-bold select-none">
                {comment.isDeleted ? '?' : comment.author.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-900">
                  {comment.isDeleted ? '[deleted]' : comment.author.username}
                </span>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <time title={formatFullDate(comment.createdAt)}>
                    {formatDate(comment.createdAt)}
                  </time>
                  {comment.editedAt && (
                    <span title={`Edited ${formatFullDate(comment.editedAt)}`} className="italic">
                      · edited
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions menu */}
            {!comment.isDeleted && isOwner && (
              <div className="flex items-center space-x-1">
                {canEdit && (
                  <button
                    onClick={handleEdit}
                    className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                    aria-label="Edit comment"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 transition-colors"
                  aria-label="Delete comment"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {/* Body */}
          {isEditing ? (
            <EditForm comment={comment} onCancel={() => dispatch(setEditingComment(null))} />
          ) : (
            <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">
              {comment.isDeleted ? (
                <span className="italic text-gray-400">[deleted]</span>
              ) : (
                <HighlightedText text={comment.message} query={searchQuery} />
              )}
            </div>
          )}

          {/* Footer actions */}
          {!isEditing && (
            <div className="mt-3 flex items-center space-x-4">
              {/* Like */}
              <button
                onClick={handleLike}
                disabled={!user}
                className={`flex items-center space-x-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-all ${
                  hasLiked
                    ? 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                } disabled:cursor-not-allowed disabled:opacity-50`}
                aria-label={hasLiked ? 'Unlike' : 'Like'}
              >
                <svg
                  className={`h-4 w-4 ${hasLiked ? 'fill-current' : ''}`}
                  fill={hasLiked ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                <span>{comment.likes > 0 ? comment.likes : ''}</span>
              </button>

              {/* Reply */}
              {!comment.isDeleted && user && (
                <button
                  onClick={handleReply}
                  className={`flex items-center space-x-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-all ${
                    isReplying
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  aria-label="Reply"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                  <span>Reply</span>
                </button>
              )}

              {/* Collapse / Expand children */}
              {node.children.length > 0 && (
                <button
                  onClick={toggleChildren}
                  className="flex items-center space-x-1 text-xs font-medium text-gray-500 hover:text-gray-700 rounded-lg px-3 py-1.5 hover:bg-gray-100 transition-all"
                  aria-label={childrenVisible ? 'Collapse replies' : 'Expand replies'}
                >
                  <svg
                    className={`h-4 w-4 transition-transform ${childrenVisible ? '' : '-rotate-90'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  <span>
                    {childrenVisible ? 'Hide' : 'Show'} {node.children.length}{' '}
                    {node.children.length === 1 ? 'reply' : 'replies'}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Reply Form */}
        {isReplying && (
          <div className="mt-2 ml-6">
            <ReplyForm
              parentId={comment.id}
              onCancel={() => dispatch(setReplyingTo(null))}
            />
          </div>
        )}
      </div>

      {/* Children */}
      {childrenVisible && node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <CommentItem key={child.data.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});
