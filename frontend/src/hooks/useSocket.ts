import { useEffect, useRef, useCallback } from 'react';
import { socketService } from '@/services/socketService';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  connect as connectAction,
  disconnect as disconnectAction,
  startSync,
  completeSync,
  setError,
} from '@/store/slices/socketSlice';
import { updateFromEvent, updateLatestEventId } from '@/store/slices/commentsSlice';
import {
  EventType,
  BroadcastEnvelope,
  CommentCreatedPayload,
  CommentUpdatedPayload,
  CommentDeletedPayload,
  CommentLikedPayload,
  CommentUnlikedPayload,
} from '@/types/event';
import { IComment } from '@/types/comment';
import toast from 'react-hot-toast';

export function useSocket() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const latestEventId = useAppSelector((state) => state.comments.latestEventId);
  const flatComments = useAppSelector((state) => state.comments.flatComments);

  // Stable refs so handlers don't change identity on every render
  const latestEventIdRef = useRef(latestEventId);
  const flatCommentsRef = useRef(flatComments);

  useEffect(() => { latestEventIdRef.current = latestEventId; }, [latestEventId]);
  useEffect(() => { flatCommentsRef.current = flatComments; }, [flatComments]);

  // ─── Socket event handlers ───────────────────────────────────────────────────
  const handleCommentCreated = useCallback(
    (envelope: BroadcastEnvelope) => {
      const payload = envelope.payload as CommentCreatedPayload;
      // Skip if already present (came via HTTP response)
      if (flatCommentsRef.current[payload.commentId]) return;

      const comment: IComment = {
        _id: '',
        id: payload.commentId,
        parentId: payload.parentId,
        author: { id: payload.authorId, username: payload.authorUsername },
        message: payload.message,
        likes: 0,
        likedBy: [],
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        eventId: envelope.eventId,
      };
      dispatch(updateFromEvent(comment));
    },
    [dispatch]
  );

  const handleCommentUpdated = useCallback(
    (envelope: BroadcastEnvelope) => {
      const payload = envelope.payload as CommentUpdatedPayload;
      const existing = flatCommentsRef.current[payload.commentId];
      if (!existing) return;

      dispatch(
        updateFromEvent({
          ...existing,
          message: payload.message,
          editedAt: payload.editedAt,
          eventId: envelope.eventId,
        })
      );
    },
    [dispatch]
  );

  const handleCommentDeleted = useCallback(
    (envelope: BroadcastEnvelope) => {
      const payload = envelope.payload as CommentDeletedPayload;
      const existing = flatCommentsRef.current[payload.commentId];
      if (!existing) return;

      dispatch(
        updateFromEvent({
          ...existing,
          isDeleted: true,
          message: '[deleted]',
          eventId: envelope.eventId,
        })
      );
    },
    [dispatch]
  );

  const handleCommentLiked = useCallback(
    (envelope: BroadcastEnvelope) => {
      const payload = envelope.payload as CommentLikedPayload;
      const existing = flatCommentsRef.current[payload.commentId];
      if (!existing) return;

      const alreadyLiked = existing.likedBy.includes(payload.userId);
      dispatch(
        updateFromEvent({
          ...existing,
          likes: payload.likes,
          likedBy: alreadyLiked ? existing.likedBy : [...existing.likedBy, payload.userId],
          eventId: envelope.eventId,
        })
      );
    },
    [dispatch]
  );

  const handleCommentUnliked = useCallback(
    (envelope: BroadcastEnvelope) => {
      const payload = envelope.payload as CommentUnlikedPayload;
      const existing = flatCommentsRef.current[payload.commentId];
      if (!existing) return;

      dispatch(
        updateFromEvent({
          ...existing,
          likes: payload.likes,
          likedBy: existing.likedBy.filter((id) => id !== payload.userId),
          eventId: envelope.eventId,
        })
      );
    },
    [dispatch]
  );

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    socketService.connect();

    // Register all comment event handlers
    socketService.on(EventType.COMMENT_CREATED, handleCommentCreated);
    socketService.on(EventType.COMMENT_UPDATED, handleCommentUpdated);
    socketService.on(EventType.COMMENT_DELETED, handleCommentDeleted);
    socketService.on(EventType.COMMENT_LIKED, handleCommentLiked);
    socketService.on(EventType.COMMENT_UNLIKED, handleCommentUnliked);

    // Wire socket connection events → Redux so the banner is reactive
    socketService.onConnect(() => {
      dispatch(connectAction());
    });

    socketService.onDisconnect(() => {
      dispatch(disconnectAction());
    });

    socketService.onSyncComplete((payload) => {
      dispatch(updateLatestEventId(payload.latestEventId));
      dispatch(completeSync());
    });

    socketService.onError((error) => {
      dispatch(setError(error.message));
      toast.error(`Sync error: ${error.message}`);
    });

    // Sync missed events shortly after connecting
    const timer = setTimeout(() => {
      if (socketService.isConnected()) {
        dispatch(startSync());
        socketService.sync(latestEventIdRef.current);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      socketService.off(EventType.COMMENT_CREATED, handleCommentCreated);
      socketService.off(EventType.COMMENT_UPDATED, handleCommentUpdated);
      socketService.off(EventType.COMMENT_DELETED, handleCommentDeleted);
      socketService.off(EventType.COMMENT_LIKED, handleCommentLiked);
      socketService.off(EventType.COMMENT_UNLIKED, handleCommentUnliked);
      socketService.disconnect();
      dispatch(disconnectAction());
    };
    // Handlers are stable refs; only re-run when auth state changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);
}
