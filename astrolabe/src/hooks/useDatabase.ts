import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NodeRecord, EdgeRecord, ProfileRecord } from "../types";

/**
 * Thin wrappers around Tauri Rust commands for SQLite persistence.
 * All functions are safe to call — they silently catch errors so the UI
 * never crashes due to a DB failure.
 */
export function useDatabase() {
  const initDb = useCallback(async () => {
    try {
      await invoke("init_db");
    } catch (err) {
      console.error("init_db failed:", err);
    }
  }, []);

  // ── Profile commands ─────────────────────────────────────────────────────

  const createProfile = useCallback(
    async (profile: Omit<ProfileRecord, "created_at">): Promise<ProfileRecord | null> => {
      try {
        return await invoke<ProfileRecord>("create_profile", {
          id: profile.id,
          name: profile.name,
          description: profile.description,
          color: profile.color,
        });
      } catch (err) {
        console.error("create_profile failed:", err);
        return null;
      }
    },
    []
  );

  const getAllProfiles = useCallback(async (): Promise<ProfileRecord[]> => {
    try {
      return await invoke<ProfileRecord[]>("get_all_profiles");
    } catch (err) {
      console.error("get_all_profiles failed:", err);
      return [];
    }
  }, []);

  const deleteProfile = useCallback(async (id: string): Promise<void> => {
    try {
      await invoke("delete_profile", { id });
    } catch (err) {
      console.error("delete_profile failed:", err);
    }
  }, []);

  const updateProfile = useCallback(
    async (id: string, name: string, description: string): Promise<void> => {
      try {
        await invoke("update_profile", { id, name, description });
      } catch (err) {
        console.error("update_profile failed:", err);
      }
    },
    []
  );

  // ── Node / Edge commands ─────────────────────────────────────────────────

  const upsertNode = useCallback(async (node: NodeRecord) => {
    try {
      await invoke("upsert_node", { node });
    } catch (err) {
      console.error("upsert_node failed:", err);
    }
  }, []);

  const deleteNode = useCallback(async (id: string) => {
    try {
      await invoke("delete_node", { id });
    } catch (err) {
      console.error("delete_node failed:", err);
    }
  }, []);

  const getAllNodes = useCallback(async (profileId: string): Promise<NodeRecord[]> => {
    try {
      return await invoke<NodeRecord[]>("get_all_nodes", { profileId });
    } catch (err) {
      console.error("get_all_nodes failed:", err);
      return [];
    }
  }, []);

  const upsertEdge = useCallback(async (edge: EdgeRecord) => {
    try {
      await invoke("upsert_edge", { edge });
    } catch (err) {
      console.error("upsert_edge failed:", err);
    }
  }, []);

  const deleteEdge = useCallback(async (id: string) => {
    try {
      await invoke("delete_edge", { id });
    } catch (err) {
      console.error("delete_edge failed:", err);
    }
  }, []);

  const getAllEdges = useCallback(async (profileId: string): Promise<EdgeRecord[]> => {
    try {
      return await invoke<EdgeRecord[]>("get_all_edges", { profileId });
    } catch (err) {
      console.error("get_all_edges failed:", err);
      return [];
    }
  }, []);

  const logQuestEvent = useCallback(
    async (nodeId: string, event: string, payload?: unknown) => {
      try {
        await invoke("log_quest_event", {
          nodeId,
          event,
          payload: JSON.stringify(payload ?? null),
        });
      } catch (err) {
        console.error("log_quest_event failed:", err);
      }
    },
    []
  );

  return {
    initDb,
    createProfile,
    getAllProfiles,
    deleteProfile,
    updateProfile,
    upsertNode,
    deleteNode,
    getAllNodes,
    upsertEdge,
    deleteEdge,
    getAllEdges,
    logQuestEvent,
  };
}
