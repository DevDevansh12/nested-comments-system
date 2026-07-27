import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { commentService } from '@/services/commentService';
import type { DeleteCommentResponse } from '@/services/commentService';
import { CommentNode, CreateCommentDto, UpdateCommentDto, IComment } from '@/types/comment';
import { TreeBuilder } from '@/utils/TreeBuilder';

// ─── State ────────────────────────────────────────────────────────────────────
// flatComments is a plain Record (serializable) keyed by comment UUID.
interface CommentsState {
  roots: CommentNode[];
  flatComments: Record<string, IComment>;
  nextCursor: string | null;
  hasMore: boolean;
  latestEventId: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  searchQuery: string;
  highlightedCommentId: string | null;
}

const initialState: CommentsState = {
  roots: [],
  flatComments: {},
  nextCursor: null,
  hasMore: false,
  latestEventId: 0,
  loading: false,
  loadingMore: false,
  error: null,
  searchQuery: '',
  highlightedCommentId: null,
};

// ─── Tree helpers ─────────────────────────────────────────────────────────────

/** Flatten a CommentNode tree into a list of IComment. */
function flattenTree(roots: CommentNode[]): IComment[] {
  const result: IComment[] = [];
  const stack: CommentNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node.data);
    stack.push(...node.children);
  }
  return result;
}

/** Rebuild roots from the current flatComments record. */
function rebuildRoots(flatComments: Record<string, IComment>): CommentNode[] {
  // Sort by createdAt ascending so the tree preserves chronological order
  const comments = Object.values(flatComments).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const { roots } = TreeBuilder.fromArray(comments);
  return roots;
}

// ─── Async thunks ─────────────────────────────────────────────────────────────

export const fetchComments = createAsyncThunk(
  'comments/fetchComments',
  async (cursor: string | undefined, { rejectWithValue }) => {
    try {
      return await commentService.getComments(cursor);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to fetch comments'
      );
    }
  }
);

export const createComment = createAsyncThunk(
  'comments/createComment',
  async (data: CreateCommentDto, { rejectWithValue }) => {
    try {
      return await commentService.createComment(data);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to create comment'
      );
    }
  }
);

export const replyToComment = createAsyncThunk(
  'comments/replyToComment',
  async ({ parentId, data }: { parentId: string; data: CreateCommentDto }, { rejectWithValue }) => {
    try {
      return await commentService.replyToComment(parentId, data);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to post reply'
      );
    }
  }
);

export const updateComment = createAsyncThunk(
  'comments/updateComment',
  async ({ id, data }: { id: string; data: UpdateCommentDto }, { rejectWithValue }) => {
    try {
      return await commentService.updateComment(id, data);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to update comment'
      );
    }
  }
);

export const deleteComment = createAsyncThunk(
  'comments/deleteComment',
  async (id: string, { rejectWithValue }) => {
    try {
      return await commentService.deleteComment(id);
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to delete comment'
      );
    }
  }
);

export const toggleLike = createAsyncThunk(
  'comments/toggleLike',
  async (id: string, { rejectWithValue }) => {
    try {
      const result = await commentService.toggleLike(id);
      return { id, ...result };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to toggle like'
      );
    }
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const commentsSlice = createSlice({
  name: 'comments',
  initialState,
  reducers: {
    // Optimistic: add a new comment (before server confirms)
    addCommentOptimistic(state, action: PayloadAction<IComment>) {
      state.flatComments[action.payload.id] = action.payload;
      state.roots = rebuildRoots(state.flatComments);
    },
    // Optimistic: apply an edit
    updateCommentOptimistic(state, action: PayloadAction<IComment>) {
      const existing = state.flatComments[action.payload.id];
      if (existing) {
        state.flatComments[action.payload.id] = action.payload;
        state.roots = rebuildRoots(state.flatComments);
      }
    },
    // Optimistic: soft-delete
    deleteCommentOptimistic(state, action: PayloadAction<string>) {
      const comment = state.flatComments[action.payload];
      if (comment) {
        state.flatComments[action.payload] = {
          ...comment,
          isDeleted: true,
          message: '[deleted]',
        };
        state.roots = rebuildRoots(state.flatComments);
      }
    },
    toggleLikeOptimistic(
      state,
      action: PayloadAction<{ id: string; userId: string; liked: boolean }>
    ) {
      const { id, userId, liked } = action.payload;
      const comment = state.flatComments[id];
      if (comment) {
        const currentLikedBy = comment.likedBy ?? [];
        const newLikedBy = liked
          ? [...currentLikedBy, userId]
          : currentLikedBy.filter((uid) => uid !== userId);
        state.flatComments[id] = {
          ...comment,
          likes: liked ? comment.likes + 1 : Math.max(0, comment.likes - 1),
          likedBy: newLikedBy,
        };
        state.roots = rebuildRoots(state.flatComments);
      }
    },
    // Rollback: restore snapshot (for any optimistic failure)
    rollbackOptimistic(state, action: PayloadAction<IComment>) {
      const comment = action.payload;
      if (comment.isDeleted && comment.id.startsWith('optimistic-')) {
        // Optimistic comment that failed — remove it entirely
        delete state.flatComments[comment.id];
      } else if (comment.isDeleted && comment._id === '') {
        // Optimistic comment with empty _id that we want to clean up
        delete state.flatComments[comment.id];
      } else {
        // Restore the pre-mutation snapshot
        state.flatComments[comment.id] = comment;
      }
      state.roots = rebuildRoots(state.flatComments);
    },
    // Socket event: upsert a comment received over WebSocket
    updateFromEvent(state, action: PayloadAction<IComment>) {
      state.flatComments[action.payload.id] = action.payload;
      state.roots = rebuildRoots(state.flatComments);
    },
    // Socket event: hard-remove a comment (leaf deletion broadcast)
    removeFromEvent(state, action: PayloadAction<string>) {
      delete state.flatComments[action.payload];
      state.roots = rebuildRoots(state.flatComments);
    },
    // Update the latest event cursor after sync_complete
    updateLatestEventId(state, action: PayloadAction<number>) {
      state.latestEventId = action.payload;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setHighlightedComment(state, action: PayloadAction<string | null>) {
      state.highlightedCommentId = action.payload;
    },
    clearComments(state) {
      state.roots = [];
      state.flatComments = {};
      state.nextCursor = null;
      state.hasMore = false;
      state.latestEventId = 0;
    },
  },
  extraReducers: (builder) => {
    // fetchComments
    builder
      .addCase(fetchComments.pending, (state, action) => {
        // First load vs "load more"
        if (action.meta.arg === undefined) {
          state.loading = true;
        } else {
          state.loadingMore = true;
        }
        state.error = null;
      })
      .addCase(fetchComments.fulfilled, (state, action) => {
        state.loading = false;
        state.loadingMore = false;
        state.nextCursor = action.payload.nextCursor;
        state.hasMore = action.payload.hasMore;
        state.latestEventId = action.payload.latestEventId;

        // Merge incoming comments into flat store (may already have some via socket)
        const incoming = flattenTree(action.payload.roots);
        incoming.forEach((c) => {
          // The API strips likedBy from responses — default it to [] so
          // downstream code can always call .includes() safely.
          state.flatComments[c.id] = {
            ...c,
            likedBy: c.likedBy ?? [],
          };
        });
        state.roots = rebuildRoots(state.flatComments);
      })
      .addCase(fetchComments.rejected, (state, action) => {
        state.loading = false;
        state.loadingMore = false;
        state.error = action.payload as string;
      });

    // createComment — server response is source of truth after optimistic
    builder.addCase(createComment.fulfilled, (state, action) => {
      const comment = action.payload as IComment;
      // Remove any temporary optimistic copy (different id) — the real one lands here
      state.flatComments[comment.id] = comment;
      state.roots = rebuildRoots(state.flatComments);
    });

    // replyToComment
    builder.addCase(replyToComment.fulfilled, (state, action) => {
      const comment = action.payload as IComment;
      state.flatComments[comment.id] = comment;
      state.roots = rebuildRoots(state.flatComments);
    });

    // updateComment — confirmed update from server
    builder.addCase(updateComment.fulfilled, (state, action) => {
      const comment = action.payload as IComment;
      state.flatComments[comment.id] = comment;
      state.roots = rebuildRoots(state.flatComments);
    });

    // deleteComment — confirmed result from server
    builder.addCase(deleteComment.fulfilled, (state, action) => {
      const { comment } = action.payload as DeleteCommentResponse;
      state.flatComments[comment.id] = comment;
      state.roots = rebuildRoots(state.flatComments);
    });

    // toggleLike — update likes with server-confirmed count
    builder.addCase(toggleLike.fulfilled, (state, action) => {
      const { id, likes } = action.payload;
      const comment = state.flatComments[id];
      if (comment) {
        state.flatComments[id] = { ...comment, likes };
        state.roots = rebuildRoots(state.flatComments);
      }
    });
  },
});

export const {
  addCommentOptimistic,
  updateCommentOptimistic,
  deleteCommentOptimistic,
  toggleLikeOptimistic,
  rollbackOptimistic,
  updateFromEvent,
  removeFromEvent,
  updateLatestEventId,
  setSearchQuery,
  setHighlightedComment,
  clearComments,
} = commentsSlice.actions;

export default commentsSlice.reducer;
