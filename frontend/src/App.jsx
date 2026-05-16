import { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

const SYSTEM_MSG = {
  role: "system",
  content: "You are a helpful AI assistant. Be concise and friendly.",
};

export default function App() {
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

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
    const history = [...messages, userMsg];
    setMessages(history);
    setStreaming(true);

    // placeholder for the assistant reply
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [SYSTEM_MSG, ...history] }),
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
    } catch (err) {
      setMessages((prev) => prev.slice(0, -1)); // remove empty placeholder
      setError(err.message);
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }

  function clear() {
    if (streaming) return;
    setMessages([]);
    setError("");
  }

  return (
    <>
      <div className="header">
        <div className="header-dot" />
        <h1>AI Chat</h1>
        <span className="header-model">DeepSeek V4 Flash · OpenRouter</span>
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
              <div className="avatar">
                {msg.role === "user" ? "U" : "AI"}
              </div>
              <div
                className={`bubble${
                  streaming && i === messages.length - 1 && msg.role === "assistant"
                    ? " streaming"
                    : ""
                }`}
              >
                {msg.content || " "}
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
          <button className="clear-btn" onClick={clear} disabled={streaming}>
            Clear
          </button>
        )}
        <button className="send-btn" onClick={send} disabled={!input.trim() || streaming}>
          {streaming ? "…" : "↑"}
        </button>
      </div>
    </>
  );
}
