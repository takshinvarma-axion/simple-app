import { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL ?? "";
const ERROR_PREFIX = "\x00ERR:";
const TIMEOUT_MS = 30_000;

const SYSTEM_MSG = {
  role: "system",
  content: "You are a helpful AI assistant. Be concise and friendly.",
};

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setError("");
    setInput("");

    const userMsg = { role: "user", content: text };

    // Filter out any empty assistant messages left from a previous failed turn.
    const cleanHistory = messages.filter((m) => m.content.trim() !== "");
    const history = [...cleanHistory, userMsg];

    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [SYSTEM_MSG, ...history] }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const snapshot = reply;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: snapshot };
          return next;
        });
      }

      // Flush any remaining bytes in the decoder.
      reply += decoder.decode();

      // Detect mid-stream errors signaled by the backend.
      if (reply.startsWith(ERROR_PREFIX)) {
        throw new Error(reply.slice(ERROR_PREFIX.length));
      }

      // Treat a fully empty reply as an error too.
      if (!reply.trim()) {
        throw new Error("Model returned no response. Try again.");
      }

      // Commit the final content (includes flushed bytes).
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: reply };
        return next;
      });
    } catch (err) {
      // Remove the assistant placeholder (empty or partial) so history stays clean.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" ? prev.slice(0, -1) : prev;
      });
      const msg = err.name === "AbortError" ? "Request timed out. Try again." : err.message;
      setError(msg);
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function clear() {
    if (streaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    setError("");
    setStreaming(false);
  }

  return (
    <>
      <div className="header">
        <div className="header-dot" />
        <h1>AI Chat</h1>
        <span className="header-model">Gemma 4 31B · OpenRouter</span>
      </div>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="big-dot">💬</div>
            <p>Send a message to start chatting</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="avatar">{msg.role === "user" ? "U" : "AI"}</div>
              <div
                className={`bubble${
                  streaming && i === messages.length - 1 && msg.role === "assistant"
                    ? " streaming"
                    : ""
                }`}
              >
                {msg.content || " "}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="error-bar">Error: {error}</div>}

      <div className="input-bar">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="Message… (Enter to send, Shift+Enter for new line)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={streaming}
        />
        {messages.length > 0 && (
          <button className="clear-btn" onClick={clear}>
            {streaming ? "Stop" : "Clear"}
          </button>
        )}
        <button
          className="send-btn"
          onClick={send}
          disabled={!input.trim() || streaming}
        >
          {streaming ? "…" : "↑"}
        </button>
      </div>
    </>
  );
}
