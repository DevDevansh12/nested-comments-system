import { IComment, CommentNode } from '@/types/comment';

export class TreeBuilder {
  private nodeMap: Map<string, CommentNode> = new Map();
  private orphanQueue: Map<string, CommentNode[]> = new Map();
  private roots: CommentNode[] = [];

  insert(comment: IComment): void {
    if (this.nodeMap.has(comment.id)) {
      return; // Already exists
    }

    const node: CommentNode = {
      data: comment,
      children: [],
    };

    this.nodeMap.set(comment.id, node);
    this.flushOrphanQueue(comment.id, node);

    if (comment.parentId === null) {
      this.roots.push(node);
    } else {
      const parentNode = this.nodeMap.get(comment.parentId);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        this.enqueueOrphan(comment.parentId, node);
      }
    }
  }

  update(comment: IComment): boolean {
    const node = this.nodeMap.get(comment.id);
    if (!node) {
      return false;
    }
    node.data = comment;
    return true;
  }

  has(id: string): boolean {
    return this.nodeMap.has(id);
  }

  getNode(id: string): CommentNode | undefined {
    return this.nodeMap.get(id);
  }

  getTree(): { roots: CommentNode[]; orphans: CommentNode[] } {
    return {
      roots: this.roots,
      orphans: this.collectOrphans(),
    };
  }

  get size(): number {
    return this.nodeMap.size;
  }

  static fromArray(comments: IComment[]): { roots: CommentNode[]; orphans: CommentNode[] } {
    const builder = new TreeBuilder();
    comments.forEach((comment) => builder.insert(comment));
    return builder.getTree();
  }

  private flushOrphanQueue(parentId: string, parentNode: CommentNode): void {
    const waiting = this.orphanQueue.get(parentId);
    if (!waiting) {
      return;
    }

    waiting.forEach((orphan) => {
      parentNode.children.push(orphan);
    });

    this.orphanQueue.delete(parentId);
  }

  private enqueueOrphan(parentId: string, node: CommentNode): void {
    const existing = this.orphanQueue.get(parentId);
    if (existing) {
      existing.push(node);
    } else {
      this.orphanQueue.set(parentId, [node]);
    }
  }

  private collectOrphans(): CommentNode[] {
    const result: CommentNode[] = [];
    this.orphanQueue.forEach((nodes) => {
      result.push(...nodes);
    });
    return result;
  }
}
