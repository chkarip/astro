/**
 * @file nodeSerializer.ts
 *
 * Converts between React Flow `Node` objects and `NodeRecord` DB rows.
 *
 * Two functions are exported:
 *  - `nodeToRecord`  — React Flow Node  → NodeRecord  (for DB writes)
 *  - `migrateBrainstormBlocks` — ensures loaded ChildBlock[] use the current
 *    BrainstormBullet shape ({id, text}) instead of the legacy string[] shape.
 *
 * Keeping serialisation logic here rather than inline in App.tsx makes it:
 *  - Easier to unit-test
 *  - Safer to extend (adding a new node type touches one switch/if block)
 *  - Impossible to accidentally call with the wrong `profileId`
 */

import type { Node } from "@xyflow/react";
import type { NodeRecord, IndexCardData, TaskData, ChildBlock, BrainstormBlock, BrainstormBullet } from "../types";

// ─── nodeToRecord ─────────────────────────────────────────────────────────────

/**
 * Converts a React Flow `Node` into a `NodeRecord` ready for DB persistence.
 *
 * Rules per node type:
 *  - `task`      → title from data.title; body = JSON.stringify(childBlocks)
 *  - `note`      → title from data.text; body = ""
 *  - `milestone` → title from data.label; body = ""
 *  - `golden`    → title = "Oracle"; body = ""
 *  - `index_card`→ title from data.title; body from data.description
 *
 * @param node      - The React Flow node to serialise.
 * @param profileId - The active profile id to embed in the record.
 */
export function nodeToRecord(node: Node, profileId: string): NodeRecord {
  const d = node.data as Record<string, unknown>;
  const nodeType = (node.type ?? "index_card") as NodeRecord["node_type"];

  switch (nodeType) {
    case "note":
      return {
        id: node.id,
        profile_id: profileId,
        node_type: "note",
        title: (d.text as string) ?? "",
        body: "",
        status: "pending",
        position_x: node.position.x,
        position_y: node.position.y,
        parent_id: node.parentId ?? null,
      };

    case "milestone":
      return {
        id: node.id,
        profile_id: profileId,
        node_type: "milestone",
        title: (d.label as string) ?? "Milestone",
        body: "",
        status: "pending",
        position_x: node.position.x,
        position_y: node.position.y,
        parent_id: node.parentId ?? null,
      };

    case "golden":
      return {
        id: node.id,
        profile_id: profileId,
        node_type: "golden",
        title: "Oracle",
        body: "",
        status: "pending",
        position_x: node.position.x,
        position_y: node.position.y,
        parent_id: null,
      };

    case "task": {
      const td = d as unknown as TaskData;
      return {
        id: node.id,
        profile_id: profileId,
        node_type: "task",
        title: td.title ?? "",
        body: JSON.stringify(td.childBlocks ?? []),
        status: td.status ?? "pending",
        position_x: node.position.x,
        position_y: node.position.y,
        parent_id: node.parentId ?? null,
      };
    }

    case "index_card":
    default: {
      const cd = d as unknown as IndexCardData;
      return {
        id: node.id,
        profile_id: profileId,
        node_type: "index_card",
        title: cd.title ?? "",
        body: cd.description ?? "",
        status: cd.status ?? "pending",
        position_x: node.position.x,
        position_y: node.position.y,
        parent_id: node.parentId ?? null,
      };
    }
  }
}

// ─── migrateBrainstormBlocks ──────────────────────────────────────────────────

/**
 * Ensures that any `BrainstormBlock` in the supplied array uses the current
 * `BrainstormBullet` shape `{ id, text }` rather than the legacy `string[]`
 * shape that may exist in older persisted records.
 *
 * This is a pure migration helper — it does not write to the DB.
 * Call it right after `JSON.parse(r.body)` when loading task nodes.
 *
 * @example
 * let childBlocks: ChildBlock[] = [];
 * try { childBlocks = JSON.parse(r.body); } catch { /* empty *\/ }
 * childBlocks = migrateBrainstormBlocks(childBlocks);
 */
export function migrateBrainstormBlocks(blocks: ChildBlock[]): ChildBlock[] {
  return blocks.map((block) => {
    if (block.type !== "brainstorm") return block;

    const bb = block as BrainstormBlock;
    // Legacy format stored bullets as plain strings.
    if (bb.bullets.length === 0 || typeof (bb.bullets[0] as unknown) !== "string") {
      return block; // already in current format
    }

    const migrated: BrainstormBullet[] = (bb.bullets as unknown as string[]).map(
      (text) => ({ id: crypto.randomUUID(), text })
    );
    return { ...bb, bullets: migrated } satisfies BrainstormBlock;
  });
}
