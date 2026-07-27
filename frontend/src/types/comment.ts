export interface ICommentAuthor {
  id: string;
  username: string;
}

export interface IComment {
  _id: string;
  id: string;
  parentId: string | null;
  author: ICommentAuthor;
  message: string;
  likes: number;
  likedBy: string[];
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  eventId: number;
}

export interface CommentNode {
  data: IComment;
  children: CommentNode[];
}

export interface CommentTree {
  roots: CommentNode[];
  orphans: CommentNode[];
}

export interface CreateCommentDto {
  message: string;
}

export interface UpdateCommentDto {
  message: string;
}

export interface CommentsResponse {
  roots: CommentNode[];
  nextCursor: string | null;
  hasMore: boolean;
  latestEventId: number;
}

export interface LikeResponse {
  likes: number;
  liked: boolean;
}
