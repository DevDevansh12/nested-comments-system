/**
 * TreeBuilder unit tests.
 *
 * Every test uses the minimal CommentLike shape — only the fields the
 * algorithm actually touches (id, parentId, isDeleted).  This keeps
 * fixtures lean and decouples the tests from the full IComment interface.
 */

import { TreeBuilder, CommentNode, CommentLike } from "../utils/TreeBuilder";

// ─── Test fixture factory ─────────────────────────────────────────────────────

/**
 * Creates a minimal comment fixture.
 * Only the three fields required by CommentLike need values;
 * all other IComment fields are irrelevant to the tree algorithm.
 */
function makeComment(
  id: string,
  parentId: string | null = null,
  isDeleted = false
): CommentLike {
  return { id, parentId, isDeleted };
}

// Convenience: extract just the id from a node for readable assertions
function ids(nodes: CommentNode<CommentLike>[]): string[] {
  return nodes.map((n) => n.data.id);
}

// ─── Helper: depth-first id list ─────────────────────────────────────────────

/**
 * Flattens a tree into a depth-first list of ids.
 * Used to verify that multi-level nesting is correct without
 * writing out the entire nested object structure.
 */
function dfs(nodes: CommentNode<CommentLike>[]): string[] {
  const result: string[] = [];
  function visit(node: CommentNode<CommentLike>): void {
    result.push(node.data.id);
    for (const child of node.children) {
      visit(child);
    }
  }
  for (const root of nodes) {
    visit(root);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EMPTY INPUT
// ─────────────────────────────────────────────────────────────────────────────

describe("empty input", () => {
  test("returns empty roots and no orphans for an empty array", () => {
    const { roots, orphans } = TreeBuilder.fromArray([]);
    expect(roots).toHaveLength(0);
    expect(orphans).toHaveLength(0);
  });

  test("size is 0 on a fresh builder", () => {
    const builder = new TreeBuilder<CommentLike>();
    expect(builder.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARENT BEFORE CHILD  (happy path — in-order insertion)
// ─────────────────────────────────────────────────────────────────────────────

describe("parent before child", () => {
  /**
   * Root → A → B
   * All nodes arrive in natural top-down order.
   * No orphan queue involvement — every parent is already registered
   * when its child is inserted.
   */
  test("single root with one child", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("root"),
      makeComment("child", "root"),
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0].data.id).toBe("root");
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].data.id).toBe("child");
    expect(orphans).toHaveLength(0);
  });

  test("two root comments with independent subtrees", () => {
    const comments = [
      makeComment("r1"),
      makeComment("r1-c1", "r1"),
      makeComment("r1-c2", "r1"),
      makeComment("r2"),
      makeComment("r2-c1", "r2"),
    ];
    const { roots, orphans } = TreeBuilder.fromArray(comments);

    expect(roots).toHaveLength(2);
    expect(ids(roots)).toEqual(["r1", "r2"]);
    expect(roots[0].children).toHaveLength(2);
    expect(roots[1].children).toHaveLength(1);
    expect(orphans).toHaveLength(0);
  });

  test("three-level deep nesting arrives in order", () => {
    // root → child → grandchild
    const { roots } = TreeBuilder.fromArray([
      makeComment("root"),
      makeComment("child", "root"),
      makeComment("grandchild", "child"),
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].children).toHaveLength(1);
    expect(roots[0].children[0].children[0].data.id).toBe("grandchild");
  });

  test("preserves insertion order among siblings", () => {
    // Siblings inserted in this order should appear in this order in children[]
    const { roots } = TreeBuilder.fromArray([
      makeComment("root"),
      makeComment("s1", "root"),
      makeComment("s2", "root"),
      makeComment("s3", "root"),
    ]);

    expect(ids(roots[0].children)).toEqual(["s1", "s2", "s3"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CHILD BEFORE PARENT  (orphan queue exercised)
// ─────────────────────────────────────────────────────────────────────────────

describe("child before parent", () => {
  /**
   * The child arrives first — it cannot find its parent in nodeMap,
   * so it is parked in orphanQueue["root"].
   * When the parent is inserted, orphanQueue["root"] is flushed and
   * the child is attached.
   */
  test("single child arrives before its parent", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("child", "root"), // parent "root" not yet seen
      makeComment("root"),           // parent arrives — orphan flushed
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0].data.id).toBe("root");
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].data.id).toBe("child");
    expect(orphans).toHaveLength(0); // orphan was resolved
  });

  test("multiple children arrive before their common parent", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("c1", "parent"),
      makeComment("c2", "parent"),
      makeComment("c3", "parent"),
      makeComment("parent"),
    ]);

    expect(roots[0].children).toHaveLength(3);
    // Children should be in the order they were enqueued
    expect(ids(roots[0].children)).toEqual(["c1", "c2", "c3"]);
    expect(orphans).toHaveLength(0);
  });

  test("interleaved out-of-order arrival across two parents", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("b-child", "B"),
      makeComment("a-child", "A"),
      makeComment("A"),
      makeComment("B"),
    ]);

    expect(roots).toHaveLength(2);
    const nodeA = roots.find((r) => r.data.id === "A")!;
    const nodeB = roots.find((r) => r.data.id === "B")!;
    expect(nodeA.children[0].data.id).toBe("a-child");
    expect(nodeB.children[0].data.id).toBe("b-child");
    expect(orphans).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. MULTIPLE ORPHAN LEVELS  (deep out-of-order)
// ─────────────────────────────────────────────────────────────────────────────

describe("multiple orphan levels", () => {
  /**
   * Grandchild arrives first, then child, then root.
   * Each insertion parks the node as an orphan; the chain resolves
   * bottom-up when the root eventually arrives.
   *
   * Insertion timeline:
   *   insert(grandchild) → orphanQueue["child"]
   *   insert(child)      → orphanQueue["root"], flushes orphanQueue["child"]
   *                         → grandchild attached to child ✓
   *   insert(root)       → roots[], flushes orphanQueue["root"]
   *                         → child (with grandchild) attached to root ✓
   */
  test("three-level chain arrives deepest-first", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("grandchild", "child"),
      makeComment("child", "root"),
      makeComment("root"),
    ]);

    expect(roots).toHaveLength(1);
    expect(orphans).toHaveLength(0);

    const root = roots[0];
    expect(root.data.id).toBe("root");
    expect(root.children).toHaveLength(1);

    const child = root.children[0];
    expect(child.data.id).toBe("child");
    expect(child.children).toHaveLength(1);

    expect(child.children[0].data.id).toBe("grandchild");
  });

  test("four-level chain arrives in completely reversed order", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("d", "c"),
      makeComment("c", "b"),
      makeComment("b", "a"),
      makeComment("a"),
    ]);

    expect(orphans).toHaveLength(0);
    // DFS traversal should produce the chain in top-down order
    expect(dfs(roots)).toEqual(["a", "b", "c", "d"]);
  });

  test("multiple orphan chains resolve independently", () => {
    // Chain 1: r1 → c1 → g1
    // Chain 2: r2 → c2 → g2
    // Both arrive grandchild-first
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("g1", "c1"),
      makeComment("g2", "c2"),
      makeComment("c1", "r1"),
      makeComment("c2", "r2"),
      makeComment("r1"),
      makeComment("r2"),
    ]);

    expect(roots).toHaveLength(2);
    expect(orphans).toHaveLength(0);
    expect(dfs(roots.filter((r) => r.data.id === "r1"))).toEqual(["r1", "c1", "g1"]);
    expect(dfs(roots.filter((r) => r.data.id === "r2"))).toEqual(["r2", "c2", "g2"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. UNLIMITED DEPTH
// ─────────────────────────────────────────────────────────────────────────────

describe("unlimited depth", () => {
  /**
   * Build a linear chain of 1 000 nodes (root → c1 → c2 → … → c999).
   * JavaScript's call stack is NOT used during construction (we use
   * iterative insertion, not recursion), so this should complete without
   * a stack overflow.
   */
  test("1000-level linear chain completes without stack overflow", () => {
    const DEPTH = 1000;
    const comments: CommentLike[] = [makeComment("root")];
    for (let i = 1; i < DEPTH; i++) {
      comments.push(makeComment(`c${i}`, i === 1 ? "root" : `c${i - 1}`));
    }

    const { roots, orphans } = TreeBuilder.fromArray(comments);

    expect(roots).toHaveLength(1);
    expect(orphans).toHaveLength(0);

    // Walk the chain to verify every level is correctly attached
    let current = roots[0];
    expect(current.data.id).toBe("root");
    for (let i = 1; i < DEPTH; i++) {
      expect(current.children).toHaveLength(1);
      current = current.children[0];
      expect(current.data.id).toBe(`c${i}`);
    }
    expect(current.children).toHaveLength(0); // leaf
  });

  test("wide tree: root with 500 direct children", () => {
    const comments: CommentLike[] = [makeComment("root")];
    for (let i = 0; i < 500; i++) {
      comments.push(makeComment(`child-${i}`, "root"));
    }
    const { roots } = TreeBuilder.fromArray(comments);
    expect(roots[0].children).toHaveLength(500);
  });

  test("1000-level chain arriving in reverse (all orphans) resolves completely", () => {
    const DEPTH = 1000;
    // Build reversed: deepest node first, root last
    const comments: CommentLike[] = [];
    for (let i = DEPTH - 1; i >= 1; i--) {
      comments.push(makeComment(`c${i}`, i === 1 ? "root" : `c${i - 1}`));
    }
    comments.push(makeComment("root"));

    const { roots, orphans } = TreeBuilder.fromArray(comments);

    expect(roots).toHaveLength(1);
    expect(orphans).toHaveLength(0);
    expect(roots[0].data.id).toBe("root");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. DUPLICATE COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

describe("duplicate comments", () => {
  /**
   * Inserting the same id twice must be a no-op.
   * This guards against WebSocket reconnect replays that re-deliver
   * events the client has already processed.
   */
  test("duplicate root comment is silently ignored", () => {
    const { roots } = TreeBuilder.fromArray([
      makeComment("root"),
      makeComment("root"), // duplicate — same id
    ]);

    expect(roots).toHaveLength(1);
  });

  test("duplicate child comment does not create two siblings", () => {
    const { roots } = TreeBuilder.fromArray([
      makeComment("root"),
      makeComment("child", "root"),
      makeComment("child", "root"), // duplicate
    ]);

    expect(roots[0].children).toHaveLength(1);
  });

  test("insert() is idempotent on a builder instance", () => {
    const builder = new TreeBuilder<CommentLike>();
    const comment = makeComment("root");
    builder.insert(comment);
    builder.insert(comment);
    builder.insert(comment);

    expect(builder.size).toBe(1);
    expect(builder.getTree().roots).toHaveLength(1);
  });

  test("duplicate does not reset children accumulated on the node", () => {
    const builder = new TreeBuilder<CommentLike>();
    builder.insert(makeComment("root"));
    builder.insert(makeComment("child1", "root"));
    builder.insert(makeComment("child2", "root"));
    // Now re-insert root — children should be untouched
    builder.insert(makeComment("root"));

    expect(builder.getTree().roots[0].children).toHaveLength(2);
  });

  test("duplicate orphan does not create two entries in the orphan queue", () => {
    const builder = new TreeBuilder<CommentLike>();
    builder.insert(makeComment("child", "missing-parent"));
    builder.insert(makeComment("child", "missing-parent")); // duplicate

    const { orphans } = builder.getTree();
    expect(orphans).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SOFT DELETED PARENT WITH CHILDREN
// ─────────────────────────────────────────────────────────────────────────────

describe("soft deleted parent with children", () => {
  /**
   * Soft-deleted comments (isDeleted: true) remain in the tree because:
   *   - Their children must stay anchored to a valid parentId
   *   - The thread structure must not collapse
   *   - The UI decides what to render ("this comment was deleted")
   *
   * TreeBuilder itself is intentionally unaware of isDeleted semantics —
   * it includes deleted nodes as normal. Filtering is the caller's concern.
   */
  test("deleted parent is included in tree with its children intact", () => {
    const { roots } = TreeBuilder.fromArray([
      makeComment("root", null, false),
      makeComment("deleted-parent", "root", true),   // isDeleted = true
      makeComment("child-of-deleted", "deleted-parent", false),
    ]);

    expect(roots).toHaveLength(1);
    const deletedNode = roots[0].children[0];
    expect(deletedNode.data.isDeleted).toBe(true);
    expect(deletedNode.children).toHaveLength(1);
    expect(deletedNode.children[0].data.id).toBe("child-of-deleted");
  });

  test("children of a deleted parent are not promoted to root", () => {
    const { roots } = TreeBuilder.fromArray([
      makeComment("root"),
      makeComment("deleted", "root", true),
      makeComment("grandchild", "deleted"),
    ]);

    // grandchild must NOT appear at root level
    expect(roots).toHaveLength(1);
    expect(ids(roots)).not.toContain("grandchild");

    // It must be nested under the deleted node
    const deleted = roots[0].children[0];
    expect(deleted.children[0].data.id).toBe("grandchild");
  });

  test("deleted root comment is still included in roots", () => {
    const { roots } = TreeBuilder.fromArray([
      makeComment("deleted-root", null, true),
      makeComment("reply", "deleted-root"),
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0].data.isDeleted).toBe(true);
    expect(roots[0].children).toHaveLength(1);
  });

  test("deeply nested deleted nodes preserve the chain", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("r"),
      makeComment("a", "r", false),
      makeComment("b", "a", true),  // deleted middle node
      makeComment("c", "b", false),
      makeComment("d", "c", true),  // deleted leaf chain
    ]);

    expect(orphans).toHaveLength(0);
    expect(dfs(roots)).toEqual(["r", "a", "b", "c", "d"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. update() METHOD
// ─────────────────────────────────────────────────────────────────────────────

describe("update()", () => {
  test("updates data of an existing node and returns true", () => {
    const builder = new TreeBuilder<CommentLike & { message?: string }>();
    builder.insert({ id: "root", parentId: null, isDeleted: false, message: "original" });

    const updated = builder.update({ id: "root", parentId: null, isDeleted: false, message: "edited" });

    expect(updated).toBe(true);
    expect(builder.getNode("root")!.data.message).toBe("edited");
  });

  test("returns false for a non-existent node", () => {
    const builder = new TreeBuilder<CommentLike>();
    expect(builder.update(makeComment("ghost"))).toBe(false);
  });

  test("update preserves children of the updated node", () => {
    const builder = new TreeBuilder<CommentLike & { message?: string }>();
    builder.insert({ id: "root", parentId: null, isDeleted: false });
    builder.insert({ id: "child", parentId: "root", isDeleted: false });

    builder.update({ id: "root", parentId: null, isDeleted: true });

    // Children should be intact after data update
    expect(builder.getNode("root")!.children).toHaveLength(1);
    expect(builder.getNode("root")!.data.isDeleted).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. TRUE ORPHANS  (parent never arrives)
// ─────────────────────────────────────────────────────────────────────────────

describe("true orphans (parent never arrives)", () => {
  test("comment with a missing parent appears in orphans", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("child", "ghost-parent"),
    ]);

    expect(roots).toHaveLength(0);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].data.id).toBe("child");
  });

  test("orphans are removed from orphans list when parent arrives", () => {
    const builder = new TreeBuilder<CommentLike>();
    builder.insert(makeComment("child", "parent"));
    expect(builder.getTree().orphans).toHaveLength(1);

    builder.insert(makeComment("parent")); // parent arrives
    expect(builder.getTree().orphans).toHaveLength(0);
  });

  test("mix of resolved and unresolved orphans", () => {
    const { roots, orphans } = TreeBuilder.fromArray([
      makeComment("c1", "known-parent"),
      makeComment("c2", "unknown-parent"), // this stays orphaned
      makeComment("known-parent"),
    ]);

    expect(roots).toHaveLength(1);
    expect(roots[0].children).toHaveLength(1);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].data.id).toBe("c2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. has() AND getNode() ACCESSORS
// ─────────────────────────────────────────────────────────────────────────────

describe("has() and getNode()", () => {
  test("has() returns true for inserted node", () => {
    const builder = new TreeBuilder<CommentLike>();
    builder.insert(makeComment("a"));
    expect(builder.has("a")).toBe(true);
  });

  test("has() returns false for unknown id", () => {
    const builder = new TreeBuilder<CommentLike>();
    expect(builder.has("none")).toBe(false);
  });

  test("getNode() returns the correct node", () => {
    const builder = new TreeBuilder<CommentLike>();
    builder.insert(makeComment("a"));
    builder.insert(makeComment("b", "a"));
    const node = builder.getNode("b");
    expect(node).toBeDefined();
    expect(node!.data.parentId).toBe("a");
  });

  test("getNode() returns undefined for unknown id", () => {
    const builder = new TreeBuilder<CommentLike>();
    expect(builder.getNode("x")).toBeUndefined();
  });
});
