/**
 * TreeBuilder — O(n) adjacency-list → tree converter with orphan queuing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROBLEM STATEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * The database returns a flat list of comment documents, each carrying only
 * a `parentId` pointer. We need to turn that into an in-memory tree where
 * every node holds its children, so the UI can render nested threads.
 *
 * Naive O(n²) approach — DON'T DO THIS:
 *   For every node, scan the entire array to find its children.
 *   On a thread with 10 000 comments that is 100 million iterations.
 *
 * O(n) approach — what this file implements:
 *   Build a HashMap from id → node in one pass, then wire parent→child
 *   pointers in a second pass. Every lookup is O(1). Total work = O(n).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ORPHAN HANDLING
 * ─────────────────────────────────────────────────────────────────────────────
 * When comments arrive from the WebSocket event stream they can arrive
 * out of order — a child may arrive before its parent.  The orphan queue
 * stores these early-arriving children keyed by the parentId they are
 * waiting for.  The moment a parent node is registered, we flush its
 * orphan queue in a single pass, attaching all waiting children at once.
 *
 * This makes TreeBuilder suitable for both:
 *   a) Bulk mode  — pass all comments at once (standard page load)
 *   b) Incremental mode — call insert() as events arrive over WebSocket
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA FLOW DIAGRAM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   insert(comment)
 *       │
 *       ├─ already in nodeMap? ──YES──► skip (duplicate guard)
 *       │
 *       ├─ wrap in CommentNode { data, children: [] }
 *       │
 *       ├─ add to nodeMap (id → node)
 *       │
 *       ├─ flush orphanQueue[id] ──► attach any waiting children
 *       │
 *       ├─ parentId === null? ──YES──► add to roots[]
 *       │
 *       └─ parentId !== null
 *             │
 *             ├─ parent already in nodeMap? ──YES──► append to parent.children
 *             │
 *             └─ parent NOT in nodeMap yet ──────► push to orphanQueue[parentId]
 *
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The minimum contract a comment object must satisfy for the TreeBuilder.
 * Using a generic constraint means TreeBuilder works with:
 *   - Plain IComment objects from the DB
 *   - Lean Mongoose documents
 *   - Partial objects in unit tests
 *   - Any future comment-like shape
 */
export interface CommentLike {
  /** Public UUID — the unique identity of this comment */
  id: string;
  /** UUID of the parent, or null for root-level comments */
  parentId: string | null;
  /** Soft-delete flag — deleted nodes are still included in the tree */
  isDeleted: boolean;
}

/**
 * A node in the constructed tree.
 * Wraps the original comment data and adds a `children` array.
 * The generic `T` flows through so callers retain full type safety on `.data`.
 */
export interface CommentNode<T extends CommentLike> {
  /** The original comment object, unchanged */
  data: T;
  /**
   * Direct children of this comment, in insertion order.
   * Insertion order === the order insert() was called, which for bulk loads
   * equals the sort order from the DB query (oldest-first by createdAt).
   */
  children: CommentNode<T>[];
}

/**
 * The output of TreeBuilder.build() / TreeBuilder.getTree().
 */
export interface CommentTree<T extends CommentLike> {
  /**
   * Top-level comments (parentId === null), in insertion order.
   * Render these as the first level of the thread.
   */
  roots: CommentNode<T>[];

  /**
   * Comments whose parentId was never seen during the build.
   * In a bulk load this should always be empty — all parents are present.
   * In incremental (WebSocket) mode, orphans are re-attached the moment
   * their parent arrives, so this is only non-empty mid-stream.
   *
   * Exposing orphans lets callers decide what to do:
   *   - Ignore them (acceptable for most UIs)
   *   - Trigger a fetch for the missing parents
   *   - Display them at root level as a fallback
   */
  orphans: CommentNode<T>[];
}

// ─── TreeBuilder class ────────────────────────────────────────────────────────

/**
 * Builds and maintains an in-memory comment tree.
 *
 * Usage — bulk mode (typical page load):
 *
 *   const tree = TreeBuilder.fromArray(comments);
 *   // tree.roots contains the fully nested structure
 *
 * Usage — incremental mode (WebSocket events):
 *
 *   const builder = new TreeBuilder<IComment>();
 *   // ...on each incoming comment event:
 *   builder.insert(newComment);
 *   const { roots } = builder.getTree();
 *
 * Usage — live update of an existing comment:
 *
 *   builder.update(updatedComment);
 *   // Re-uses the existing node; only `.data` is replaced.
 */
export class TreeBuilder<T extends CommentLike> {
  /**
   * Primary index: id → CommentNode.
   *
   * Every node that has been inserted lives here.  O(1) lookup by UUID
   * is what makes the whole algorithm O(n) rather than O(n²).
   */
  private readonly nodeMap: Map<string, CommentNode<T>> = new Map();

  /**
   * Orphan queue: parentId → CommentNode[].
   *
   * When a child arrives before its parent we can't attach it yet, so we
   * park it here keyed by the parentId it is waiting for.
   *
   * Structure: Map<parentId, Array<child nodes waiting for that parent>>
   *
   * This is separate from nodeMap because an orphan's parentId is NOT yet
   * in nodeMap — the key space is disjoint.
   */
  private readonly orphanQueue: Map<string, CommentNode<T>[]> = new Map();

  /**
   * Root nodes (parentId === null) in insertion order.
   * We maintain this as a separate array rather than filtering nodeMap on
   * every getTree() call, keeping getTree() itself O(1).
   */
  private readonly roots: CommentNode<T>[] = [];

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Inserts a single comment into the tree.
   *
   * Time complexity: O(k) where k = number of orphans waiting for this node.
   * Across the full build of n nodes, the total work for orphan flushing
   * is O(n) amortised because each node is flushed at most once.
   *
   * Duplicate guard: if `comment.id` is already in nodeMap, the call is
   * silently ignored.  This makes insert() idempotent — safe to call on
   * the same event twice (e.g. WebSocket reconnect replays).
   */
  insert(comment: T): void {
    // ── Duplicate guard ────────────────────────────────────────────────────
    // If this id is already registered, skip entirely.
    // We do NOT update the data here; use update() for that purpose.
    if (this.nodeMap.has(comment.id)) {
      return;
    }

    // ── Create the node ────────────────────────────────────────────────────
    const node: CommentNode<T> = {
      data: comment,
      children: [],
    };

    // ── Register in the primary index ──────────────────────────────────────
    this.nodeMap.set(comment.id, node);

    // ── Flush orphan queue for this id ─────────────────────────────────────
    // Any previously-inserted children that were waiting for THIS node
    // as their parent can now be attached.
    //
    // Example timeline:
    //   t=1  insert(child,  parentId="A")  → A not in map → park in orphanQueue["A"]
    //   t=2  insert(parent, id="A")         → now flush orphanQueue["A"]
    //        → child is appended to parent.children immediately
    //
    // We flush before deciding where to place the current node itself,
    // so children are always attached before we move on.
    this.flushOrphanQueue(comment.id, node);

    // ── Place the node in the tree ─────────────────────────────────────────
    if (comment.parentId === null) {
      // Root-level comment — add to the roots list directly.
      this.roots.push(node);
    } else {
      const parentNode = this.nodeMap.get(comment.parentId);

      if (parentNode !== undefined) {
        // Parent is already in the tree — attach immediately.
        parentNode.children.push(node);
      } else {
        // Parent has not arrived yet — park this node in the orphan queue.
        // It will be attached when the parent is eventually inserted.
        this.enqueueOrphan(comment.parentId, node);
      }
    }
  }

  /**
   * Updates the `.data` of an existing node in-place.
   *
   * Used when a comment is edited or liked and the updated document arrives.
   * The node's position in the tree (its children, parent relationship) is
   * preserved — only the data payload is replaced.
   *
   * Returns true if the node was found and updated, false if it didn't exist.
   */
  update(comment: T): boolean {
    const node = this.nodeMap.get(comment.id);
    if (node === undefined) {
      return false;
    }
    node.data = comment;
    return true;
  }

  /**
   * Checks whether a comment with the given id exists in the tree.
   */
  has(id: string): boolean {
    return this.nodeMap.has(id);
  }

  /**
   * Returns the CommentNode for a given id, or undefined if not found.
   * Useful for targeted UI updates without rebuilding the full tree.
   */
  getNode(id: string): CommentNode<T> | undefined {
    return this.nodeMap.get(id);
  }

  /**
   * Returns the current tree state.
   *
   * `roots` — fully nested, ready to render.
   * `orphans` — comments whose parent was never inserted.
   *             In a complete bulk load this should be an empty array.
   *
   * This is O(m) where m = total number of distinct parentIds still in the
   * orphan queue (usually 0 after a complete bulk load).
   */
  getTree(): CommentTree<T> {
    return {
      roots: this.roots,
      orphans: this.collectOrphans(),
    };
  }

  /**
   * Returns the total number of nodes that have been inserted.
   */
  get size(): number {
    return this.nodeMap.size;
  }

  // ─── Static factory ──────────────────────────────────────────────────────────

  /**
   * Convenience factory for bulk mode.
   *
   * Inserts all comments in the given array and returns the finished tree.
   * Input order matters: comments are inserted in array order, so sort
   * by createdAt (ascending) before calling this if you want children
   * ordered chronologically within their parent.
   *
   * Example:
   *   const { roots } = TreeBuilder.fromArray(comments);
   */
  static fromArray<T extends CommentLike>(comments: T[]): CommentTree<T> {
    const builder = new TreeBuilder<T>();
    for (const comment of comments) {
      builder.insert(comment);
    }
    return builder.getTree();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Attaches all orphaned children that were waiting for `parentId` to arrive.
   *
   * Called immediately after a node is registered in nodeMap so there is
   * zero lag between a parent becoming available and its children being wired.
   *
   * The queue entry is deleted after flushing to free memory — once a parent
   * is known, no future node needs to look up this slot again.
   */
  private flushOrphanQueue(parentId: string, parentNode: CommentNode<T>): void {
    const waiting = this.orphanQueue.get(parentId);
    if (waiting === undefined) {
      return; // nothing was waiting for this parent
    }

    // Attach every waiting child to the now-available parent.
    // We iterate in the order they were enqueued, which is insertion order —
    // preserving the relative order among siblings that arrived out-of-sequence.
    for (const orphan of waiting) {
      parentNode.children.push(orphan);
    }

    // Remove the queue slot to free memory — this key will never be used again.
    this.orphanQueue.delete(parentId);
  }

  /**
   * Adds a node to the orphan queue under the given parentId key.
   *
   * If this is the first orphan waiting for `parentId`, a new array is
   * created. Subsequent orphans for the same parent are appended in order.
   */
  private enqueueOrphan(parentId: string, node: CommentNode<T>): void {
    const existing = this.orphanQueue.get(parentId);
    if (existing !== undefined) {
      existing.push(node);
    } else {
      this.orphanQueue.set(parentId, [node]);
    }
  }

  /**
   * Flattens the orphan queue into a single array of nodes.
   *
   * A node is a true orphan (at query-time) if its parentId is still in the
   * orphanQueue — meaning the parent was never inserted.
   *
   * Note: a node that was temporarily an orphan (parent arrived later) is
   * NOT in this list because flushOrphanQueue() deletes the queue entry when
   * the parent arrives.
   */
  private collectOrphans(): CommentNode<T>[] {
    const result: CommentNode<T>[] = [];
    for (const nodes of this.orphanQueue.values()) {
      for (const node of nodes) {
        result.push(node);
      }
    }
    return result;
  }
}
