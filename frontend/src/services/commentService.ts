import { apiService } from './api';
import {
  CommentsResponse,
  CreateCommentDto,
  UpdateCommentDto,
  LikeResponse,
  CommentNode,
  IComment,
} from '@/types/comment';

export interface DeleteCommentResponse {
  comment: IComment;
  hardDeleted: boolean;
}

export const commentService = {
  async getComments(cursor?: string, limit = 20): Promise<CommentsResponse> {
    const params: Record<string, unknown> = { limit };
    if (cursor) {
      params.cursor = cursor;
    }
    const response = await apiService.get<CommentsResponse>('/comments', params);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to fetch comments');
  },

  async getComment(id: string): Promise<CommentNode> {
    const response = await apiService.get<CommentNode>(`/comments/${id}`);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to fetch comment');
  },

  async createComment(data: CreateCommentDto): Promise<IComment> {
    const response = await apiService.post<IComment>('/comments', data);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to create comment');
  },

  async replyToComment(parentId: string, data: CreateCommentDto): Promise<IComment> {
    const response = await apiService.post<IComment>(`/comments/${parentId}/reply`, data);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to create reply');
  },

  async updateComment(id: string, data: UpdateCommentDto): Promise<IComment> {
    const response = await apiService.patch<IComment>(`/comments/${id}`, data);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to update comment');
  },

  async deleteComment(id: string): Promise<DeleteCommentResponse> {
    const response = await apiService.delete<DeleteCommentResponse>(`/comments/${id}`);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to delete comment');
  },

  async toggleLike(id: string): Promise<LikeResponse> {
    const response = await apiService.post<LikeResponse>(`/comments/${id}/like`);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.message || 'Failed to toggle like');
  },
};
