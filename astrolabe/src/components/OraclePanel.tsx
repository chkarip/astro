import { useState, useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import type { BuildPlan, ChatSession } from "../types";

type PanelMode = "chat" | "build";
type PanelView = "folders" | "chat";

interface ChatMsg {
  role: "user" | "astro";
  text: string;
  built?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onBuild: (plan: BuildPlan) => void;
  profileId: string;
}

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(createdAt: string): string {
  const d = new Date(createdAt.includes("T") ? createdAt : createdAt + "Z");
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function OraclePanel({ open, onClose, onBuild, profileId }: Props) {
  const { getNodes, getEdges } = useReactFlow();
  const [view, setView] = useState<PanelView>("folders");
  const [mode, setMode] = useState<PanelMode>("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [titleUpdated, setTitleUpdated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Refresh session list whenever panel opens
  useEffect(() => {
    if (!open) return;
    invoke<ChatSession[]>("get_chat_sessions", { profileId })
      .then((s) => {
        setSessions(s);
        const today = new Date().toISOString().split("T")[0];
        setExpandedDates(new Set([today]));
      })
      .catch(console.error);
  }, [open, profileId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildMapContext = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    return JSON.stringify({
      nodes: nodes.map((n) => {
        const d = n.data as unknown as { title?: string; status?: string };
        const childTasks = nodes.filter((c) => c.parentId === n.id && n.type === "task");
        const doneChildren = childTasks.filter((c) => (c.data as { status?: string }).status === "done").length;
        return {
          id: n.id,
          type: n.type,
          title: d?.title ?? n.type,
          status: d?.status,
          parentId: n.parentId,
          childCount: childTasks.length || undefined,
          doneChildren: doneChildren || undefined,
        };
      }),
      connections: edges.map((e) => ({ from: e.source, to: e.target, label: e.label })),
    });
  }, [getNodes, getEdges]);

  const startNewChat = useCallback(async () => {
    const id = crypto.randomUUID();
    try {
      await invoke("create_chat_session", { id, profileId, title: "New Conversation" });
      setActiveSessionId(id);
      setMessages([]);
      setDraft("");
      setTitleUpdated(false);
      setView("chat");
      invoke<ChatSession[]>("get_chat_sessions", { profileId }).then(setSessions).catch(console.error);
    } catch (err) {
      console.error("create_chat_session failed:", err);
    }
  }, [profileId]);

  const openSession = useCallback(async (sessionId: string) => {
    try {
      const msgs = await invoke<Array<{ role: string; text: string; built: boolean }>>(
        "get_chat_messages",
        { sessionId }
      );
      setMessages(msgs.map((m) => ({ role: m.role as "user" | "astro", text: m.text, built: m.built })));
      setActiveSessionId(sessionId);
      setTitleUpdated(true);
      setView("chat");
    } catch (err) {
      console.error("get_chat_messages failed:", err);
    }
  }, []);

  const goToFolders = useCallback(() => {
    setView("folders");
    setActiveSessionId(null);
    setMessages([]);
    setTitleUpdated(false);
    invoke<ChatSession[]>("get_chat_sessions", { profileId }).then(setSessions).catch(console.error);
  }, [profileId]);

  const deleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await invoke("delete_chat_session", { id: sessionId });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error("delete_chat_session failed:", err);
    }
  }, []);

  const send = useCallback(async () => {
    const input = draft.trim();
    if (!input || loading || !activeSessionId) return;
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: input }]);
    setLoading(true);

    invoke("add_chat_message", { sessionId: activeSessionId, role: "user", text: input, built: false }).catch(console.error);

    if (!titleUpdated) {
      const title = input.length > 40 ? input.slice(0, 40) + "…" : input;
      invoke("update_chat_session_title", { id: activeSessionId, title })
        .then(() => setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, title } : s)))
        .catch(console.error);
      setTitleUpdated(true);
    }

    const mapContext = buildMapContext();

    if (mode === "build") {
      try {
        const plan = await invoke<BuildPlan>("build_from_prompt", { prompt: input, mapContext });
        onBuild(plan);
        const reply = `✦ Built ${plan.nodes.length} node${plan.nodes.length !== 1 ? "s" : ""} and ${plan.edges.length} connection${plan.edges.length !== 1 ? "s" : ""}\n\n${plan.summary}`;
        setMessages((m) => [...m, { role: "astro", text: reply, built: true }]);
        invoke("add_chat_message", { sessionId: activeSessionId, role: "astro", text: reply, built: true }).catch(console.error);
      } catch (err) {
        const errMsg = `Build failed: ${String(err)}`;
        setMessages((m) => [...m, { role: "astro", text: errMsg }]);
        invoke("add_chat_message", { sessionId: activeSessionId, role: "astro", text: errMsg, built: false }).catch(console.error);
      } finally {
        setLoading(false);
      }
    } else {
      try {
        const answer = await invoke<string>("ask_oracle", { question: input, mapContext });
        setMessages((m) => [...m, { role: "astro", text: answer }]);
        invoke("add_chat_message", { sessionId: activeSessionId, role: "astro", text: answer, built: false }).catch(console.error);
      } catch (err) {
        const errMsg = `Error: ${String(err)}`;
        setMessages((m) => [...m, { role: "astro", text: errMsg }]);
        invoke("add_chat_message", { sessionId: activeSessionId, role: "astro", text: errMsg, built: false }).catch(console.error);
      } finally {
        setLoading(false);
      }
    }
  }, [draft, loading, mode, buildMapContext, onBuild, activeSessionId, titleUpdated]);

  // Group sessions by date
  const sessionsByDate = sessions.reduce<Record<string, ChatSession[]>>((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s);
    return acc;
  }, {});
  const sortedDates = Object.keys(sessionsByDate).sort((a, b) => b.localeCompare(a));

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    width: 380,
    height: "100vh",
    background: "#0d1b2e",
    borderLeft: "1.5px solid #f5a623",
    boxShadow: "-8px 0 48px rgba(245,166,35,0.12)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "var(--font-mono)",
    zIndex: 9999,
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="astro-panel"
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          style={panelStyle}
        >
          {view === "folders" ? (
            /* ── Folders view ─────────────────────────────────────────────── */
            <>
              {/* Header */}
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid #1e3a5f",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                }}
              >
                <div>
                  <span style={{ color: "#f5a623", fontWeight: 700, fontSize: 13, letterSpacing: "0.14em" }}>
                    ✦ ASTRO LOGS
                  </span>
                  <p style={{ color: "#495670", fontSize: 11, marginTop: 3 }}>
                    Select a conversation to continue
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={startNewChat}
                    style={{
                      background: "rgba(245,166,35,0.12)",
                      border: "1px solid rgba(245,166,35,0.3)",
                      color: "#f5a623",
                      borderRadius: 4,
                      padding: "4px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    + New
                  </button>
                  <button
                    onClick={onClose}
                    style={{
                      background: "transparent",
                      border: "1px solid #1e3a5f",
                      color: "#8892b0",
                      borderRadius: 4,
                      padding: "4px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Session list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
                {sortedDates.length === 0 && (
                  <p
                    style={{
                      color: "#2d4a6a",
                      fontSize: 12,
                      textAlign: "center",
                      marginTop: 48,
                      lineHeight: 1.7,
                    }}
                  >
                    No conversations yet.
                    <br />
                    Press{" "}
                    <strong style={{ color: "#f5a623" }}>+ New</strong>{" "}
                    to start one.
                  </p>
                )}

                {sortedDates.map((date) => {
                  const isExpanded = expandedDates.has(date);
                  return (
                    <div key={date}>
                      {/* Date folder row */}
                      <button
                        onClick={() => toggleDate(date)}
                        style={{
                          width: "100%",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 20px",
                          color: "#8892b0",
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,166,35,0.04)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "none";
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            display: "inline-block",
                            transition: "transform 0.2s",
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        >
                          ▶
                        </span>
                        <span style={{ fontSize: 13 }}>📁</span>
                        <span style={{ flex: 1, textAlign: "left" }}>{formatDateLabel(date)}</span>
                        <span style={{ color: "#2d4a6a", fontSize: 10 }}>
                          {sessionsByDate[date].length}
                        </span>
                      </button>

                      {/* Sessions inside folder */}
                      {isExpanded &&
                        sessionsByDate[date].map((session) => (
                          <div
                            key={session.id}
                            style={{
                              position: "relative",
                              display: "flex",
                              alignItems: "center",
                              marginLeft: 20,
                              borderLeft: "1px solid #1e3a5f",
                            }}
                          >
                            <button
                              onClick={() => openSession(session.id)}
                              style={{
                                flex: 1,
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                padding: "8px 12px 8px 16px",
                                gap: 2,
                                textAlign: "left",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = "rgba(245,166,35,0.06)";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = "none";
                              }}
                            >
                              <span
                                style={{
                                  color: "#a8c0e8",
                                  fontSize: 12,
                                  lineHeight: 1.4,
                                  maxWidth: 240,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  display: "block",
                                }}
                              >
                                {session.title}
                              </span>
                              <span style={{ color: "#2d4a6a", fontSize: 10 }}>
                                {formatTime(session.created_at)}
                              </span>
                            </button>
                            <button
                              onClick={(e) => deleteSession(e, session.id)}
                              title="Delete"
                              style={{
                                background: "none",
                                border: "none",
                                color: "#2d4a6a",
                                cursor: "pointer",
                                padding: "6px 12px",
                                fontSize: 12,
                                opacity: 0.5,
                              }}
                              onMouseEnter={(e) => {
                                const b = e.currentTarget as HTMLButtonElement;
                                b.style.opacity = "1";
                                b.style.color = "#ef4444";
                              }}
                              onMouseLeave={(e) => {
                                const b = e.currentTarget as HTMLButtonElement;
                                b.style.opacity = "0.5";
                                b.style.color = "#2d4a6a";
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* ── Chat view ────────────────────────────────────────────────── */
            <>
              {/* Header */}
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid #1e3a5f",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={goToFolders}
                    title="Back to conversations"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#8892b0",
                      cursor: "pointer",
                      fontSize: 18,
                      padding: "0 4px",
                      lineHeight: 1,
                    }}
                  >
                    ←
                  </button>
                  <div>
                    <span
                      style={{
                        color: mode === "build" ? "#a78bfa" : "#f5a623",
                        fontWeight: 700,
                        fontSize: 13,
                        letterSpacing: "0.14em",
                        transition: "color 0.2s",
                      }}
                    >
                      {mode === "build" ? "⚡ BUILD" : "✦ ASTRO"}
                    </span>
                    <p style={{ color: "#495670", fontSize: 11, marginTop: 3 }}>
                      {mode === "build"
                        ? "Describe what to build on the canvas"
                        : "Ask anything about your vision map"}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {/* Mode toggle */}
                  <div
                    style={{
                      display: "flex",
                      background: "#0a1628",
                      border: "1px solid #1e3a5f",
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => setMode("chat")}
                      title="Chat mode"
                      style={{
                        background: mode === "chat" ? "rgba(245,166,35,0.15)" : "transparent",
                        border: "none",
                        color: mode === "chat" ? "#f5a623" : "#495670",
                        padding: "4px 8px",
                        fontSize: 13,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      💬
                    </button>
                    <button
                      onClick={() => setMode("build")}
                      title="Build mode"
                      style={{
                        background: mode === "build" ? "rgba(167,139,250,0.15)" : "transparent",
                        border: "none",
                        color: mode === "build" ? "#a78bfa" : "#495670",
                        padding: "4px 8px",
                        fontSize: 13,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      ⚡
                    </button>
                  </div>
                  <button
                    onClick={onClose}
                    style={{
                      background: "transparent",
                      border: "1px solid #1e3a5f",
                      color: "#8892b0",
                      borderRadius: 4,
                      padding: "4px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {messages.length === 0 && (
                  <p
                    style={{
                      color: "#2d4a6a",
                      fontSize: 12,
                      textAlign: "center",
                      marginTop: 48,
                      lineHeight: 1.7,
                    }}
                  >
                    {mode === "build" ? (
                      <>
                        ⚡ Build Mode active.
                        <br />
                        Describe what you want to create and Astro will build it on your canvas.
                      </>
                    ) : (
                      <>
                        Your vision map is ready.
                        <br />
                        What would you like to explore?
                      </>
                    )}
                  </p>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "88%",
                    }}
                  >
                    <div
                      style={{
                        background: msg.built
                          ? "rgba(167,139,250,0.08)"
                          : msg.role === "user"
                          ? "#1e3a5f"
                          : "#112240",
                        border: `1px solid ${
                          msg.built
                            ? "rgba(167,139,250,0.4)"
                            : msg.role === "user"
                            ? "#2563eb"
                            : "rgba(245,166,35,0.2)"
                        }`,
                        borderRadius:
                          msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                        padding: "10px 14px",
                        fontSize: 12,
                        color: msg.built
                          ? "#c4b5fd"
                          : msg.role === "user"
                          ? "#ccd6f6"
                          : "#a8c0e8",
                        lineHeight: 1.65,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {msg.text}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#2d4a6a",
                        marginTop: 3,
                        paddingLeft: 4,
                      }}
                    >
                      {msg.role === "user" ? "you" : msg.built ? "⚡ astro" : "✦ astro"}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div style={{ alignSelf: "flex-start" }}>
                    <motion.div
                      style={{
                        background: "#112240",
                        border: `1px solid ${
                          mode === "build" ? "rgba(167,139,250,0.25)" : "rgba(245,166,35,0.2)"
                        }`,
                        borderRadius: "12px 12px 12px 2px",
                        padding: "10px 18px",
                        fontSize: 12,
                        color: mode === "build" ? "#a78bfa" : "#f5a623",
                      }}
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      {mode === "build" ? "building…" : "thinking…"}
                    </motion.div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div
                style={{
                  padding: "12px 20px",
                  borderTop: "1px solid #1e3a5f",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={
                      mode === "build"
                        ? "Describe what to build… (Enter to create)"
                        : "Ask Astro… (Enter to send)"
                    }
                    rows={2}
                    style={{
                      flex: 1,
                      background: "#112240",
                      border: `1px solid ${mode === "build" ? "rgba(167,139,250,0.3)" : "#1e3a5f"}`,
                      borderRadius: 6,
                      color: "#ccd6f6",
                      fontSize: 12,
                      padding: "8px 10px",
                      resize: "none",
                      outline: "none",
                      fontFamily: "var(--font-mono)",
                      transition: "border-color 0.2s",
                    }}
                  />
                  <button
                    onClick={send}
                    disabled={loading || !draft.trim()}
                    style={{
                      background: mode === "build" ? "#a78bfa" : "#f5a623",
                      color: "#0d1b2e",
                      border: "none",
                      borderRadius: 6,
                      padding: "8px 16px",
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: loading || !draft.trim() ? "not-allowed" : "pointer",
                      opacity: loading || !draft.trim() ? 0.45 : 1,
                      alignSelf: "stretch",
                      transition: "background 0.2s",
                    }}
                  >
                    {mode === "build" ? "⚡" : "↑"}
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OraclePanel;
