import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDatabase } from "../hooks/useDatabase";
import type { ProfileRecord } from "../types";

// ─── Palette of accent colours users can choose from ─────────────────────────

const PALETTE = [
  { label: "Nebula Blue",   value: "#4A9EFF" },
  { label: "Solar Amber",   value: "#f5a623" },
  { label: "Aurora Green",  value: "#4ade80" },
  { label: "Void Purple",   value: "#a78bfa" },
  { label: "Cyan Pulse",    value: "#64ffda" },
  { label: "Rose Flare",    value: "#ff6b8a" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ProfileCardProps {
  profile: ProfileRecord;
  onEnter: () => void;
  onDelete: () => void;
}

function ProfileCard({ profile, onEnter, onDelete }: ProfileCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirmDelete) {
        onDelete();
      } else {
        setConfirmDelete(true);
        confirmRef.current = setTimeout(() => setConfirmDelete(false), 3000);
      }
    },
    [confirmDelete, onDelete]
  );

  useEffect(() => () => { if (confirmRef.current) clearTimeout(confirmRef.current); }, []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      style={{
        background: "#112240",
        border: `1.5px solid ${profile.color}33`,
        borderRadius: 10,
        padding: "20px 22px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        cursor: "pointer",
        position: "relative",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = profile.color;
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 24px ${profile.color}22`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = `${profile.color}33`;
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
      onClick={onEnter}
    >
      {/* Colour swatch */}
      <div style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: profile.color,
        boxShadow: `0 0 8px ${profile.color}`,
        position: "absolute",
        top: 18,
        right: 18,
      }} />

      {/* Name */}
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 15,
        fontWeight: 700,
        color: "#ccd6f6",
        letterSpacing: "0.04em",
        paddingRight: 20,
      }}>
        {profile.name}
      </div>

      {/* Description */}
      {profile.description && (
        <div style={{
          fontFamily: "var(--font-display)",
          fontSize: 12,
          color: "#8892b0",
          lineHeight: 1.5,
        }}>
          {profile.description}
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onEnter(); }}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            padding: "5px 14px",
            background: `${profile.color}1a`,
            border: `1.5px solid ${profile.color}`,
            borderRadius: 4,
            color: profile.color,
            cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = `${profile.color}33`)}
          onMouseLeave={(e) => (e.currentTarget.style.background = `${profile.color}1a`)}
        >
          ENTER →
        </button>

        {profile.id !== "default-profile" && (
          <button
            onClick={handleDeleteClick}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              padding: "4px 10px",
              background: confirmDelete ? "rgba(255,107,138,0.18)" : "transparent",
              border: `1px solid ${confirmDelete ? "#ff6b8a" : "#1e3a5f"}`,
              borderRadius: 4,
              color: confirmDelete ? "#ff6b8a" : "#495670",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {confirmDelete ? "CONFIRM" : "✕"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Create-profile modal ─────────────────────────────────────────────────────

interface CreateModalProps {
  onCreate: (name: string, description: string, color: string) => Promise<void>;
  onClose: () => void;
}

function CreateModal({ onCreate, onClose }: CreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[0].value);
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || creating) return;
      setCreating(true);
      await onCreate(name.trim(), description.trim(), color);
      setCreating(false);
    },
    [name, description, color, creating, onCreate]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose]
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5,13,26,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <motion.form
        initial={{ opacity: 0, scale: 0.93, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#112240",
          border: "1.5px solid #1e3a5f",
          borderRadius: 12,
          padding: "32px 36px",
          width: 420,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#f5a623", letterSpacing: "0.14em" }}>
          ✦ NEW PROFILE
        </div>

        {/* Name */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8892b0", letterSpacing: "0.1em" }}>
            NAME
          </label>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Software Architecture"
            maxLength={60}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              background: "#0d1b2e",
              border: "1px solid #1e3a5f",
              borderRadius: 6,
              padding: "9px 12px",
              color: "#ccd6f6",
              outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
          />
        </div>

        {/* Description */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8892b0", letterSpacing: "0.1em" }}>
            DESCRIPTION <span style={{ color: "#495670" }}>(optional)</span>
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this space for?"
            maxLength={120}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 13,
              background: "#0d1b2e",
              border: "1px solid #1e3a5f",
              borderRadius: 6,
              padding: "9px 12px",
              color: "#ccd6f6",
              outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
          />
        </div>

        {/* Colour picker */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8892b0", letterSpacing: "0.1em" }}>
            ACCENT COLOUR
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            {PALETTE.map((p) => (
              <button
                key={p.value}
                type="button"
                title={p.label}
                onClick={() => setColor(p.value)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: p.value,
                  border: color === p.value ? `2px solid white` : "2px solid transparent",
                  boxShadow: color === p.value ? `0 0 10px ${p.value}` : "none",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #1e3a5f",
              borderRadius: 6,
              color: "#8892b0",
              cursor: "pointer",
            }}
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={!name.trim() || creating}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              padding: "8px 22px",
              background: name.trim() && !creating ? "rgba(37,99,235,0.25)" : "rgba(37,99,235,0.08)",
              border: "1.5px solid #2563eb",
              borderRadius: 6,
              color: name.trim() && !creating ? "#7aa2f7" : "#495670",
              cursor: name.trim() && !creating ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            {creating ? "CREATING…" : "CREATE"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

// ─── Observatory (main lobby) ─────────────────────────────────────────────────

interface ObservatoryProps {
  onEnterProfile: (id: string, name: string) => void;
}

export function Observatory({ onEnterProfile }: ObservatoryProps) {
  const db = useDatabase();
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    db.initDb().then(() =>
      db.getAllProfiles().then((p) => {
        setProfiles(p);
        setLoading(false);
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = useCallback(
    async (name: string, description: string, color: string) => {
      const id = crypto.randomUUID();
      const profile = await db.createProfile({ id, name, description, color });
      if (profile) setProfiles((prev) => [...prev, profile]);
      setShowCreate(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleDelete = useCallback(async (id: string) => {
    await db.deleteProfile(id);
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050d1a",
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: "40px 48px 0",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderBottom: "1px solid #1e3a5f",
          paddingBottom: 24,
        }}>
          <div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "#f5a623",
              letterSpacing: "0.22em",
              marginBottom: 8,
            }}>
              ◉ ASTROLABE
            </div>
            <h1 style={{
              fontFamily: "var(--font-mono)",
              fontSize: 28,
              fontWeight: 800,
              color: "#ccd6f6",
              margin: 0,
              letterSpacing: "-0.01em",
            }}>
              Observatory
            </h1>
            <p style={{
              fontFamily: "var(--font-display)",
              fontSize: 14,
              color: "#8892b0",
              margin: "6px 0 0",
            }}>
              Each profile is a sealed, isolated workspace. Ideas and AI context never cross boundaries.
            </p>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "10px 22px",
              background: "rgba(245,166,35,0.12)",
              border: "1.5px solid #f5a623",
              borderRadius: 6,
              color: "#f5a623",
              cursor: "pointer",
              transition: "background 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,166,35,0.22)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(245,166,35,0.12)")}
          >
            + NEW PROFILE
          </button>
        </div>
      </div>

      {/* ── Profile grid ── */}
      <div style={{
        flex: 1,
        padding: "32px 48px 48px",
        overflowY: "auto",
      }}>
        {loading ? (
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "#495670",
            letterSpacing: "0.08em",
            paddingTop: 40,
          }}>
            Loading profiles…
          </div>
        ) : (
          <motion.div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            <AnimatePresence mode="popLayout">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  onEnter={() => onEnterProfile(p.id, p.name)}
                  onDelete={() => handleDelete(p.id)}
                />
              ))}
            </AnimatePresence>

            {profiles.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  gridColumn: "1 / -1",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "#495670",
                  paddingTop: 16,
                  lineHeight: 1.8,
                }}
              >
                No profiles yet. Create one to begin.
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Create modal ── */}
      <AnimatePresence>
        {showCreate && (
          <CreateModal
            onCreate={handleCreate}
            onClose={() => setShowCreate(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
