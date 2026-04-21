import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useWs } from '../context/WsContext';
import './MessagesPage.css';

export default function MessagesPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const { subscribe } = useWs();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [thread, setThread] = useState(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (userId) loadThread(userId);
    else setThread(null);
  }, [userId]);

  useEffect(() => {
    return subscribe('message', (data) => {
      const msg = data.message;
      if (msg.sender_id === thread?.id || msg.recipient_id === thread?.id) {
        setMessages((prev) => [...prev, msg]);
      }
      loadConversations();
    });
  }, [subscribe, thread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadConversations() {
    try {
      const data = await api.messages.conversations();
      setConversations(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadThread(uid) {
    try {
      const [msgs, userProfile] = await Promise.all([
        api.messages.thread(uid),
        api.users.get(uid),
      ]);
      setMessages(msgs);
      setThread(userProfile);
    } catch (e) {
      console.error(e);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!content.trim() || !userId) return;
    setSending(true);
    try {
      const msg = await api.messages.send(userId, content.trim());
      setMessages((prev) => [...prev, msg]);
      setContent('');
      loadConversations();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="messages-page">
      <div className="conversations-panel card">
        <div className="panel-header">
          <h2>Messages</h2>
        </div>
        {loading ? (
          <div className="page-loading"><div className="spinner" /></div>
        ) : conversations.length === 0 ? (
          <div className="empty-convos">
            <p>No conversations yet</p>
            <p>Message a player to get started</p>
          </div>
        ) : (
          <div className="convo-list">
            {conversations.map((c) => (
              <div
                key={c.other_user}
                className={`convo-item${userId === c.other_user ? ' active' : ''}`}
                onClick={() => navigate(`/messages/${c.other_user}`)}
              >
                <div className="convo-avatar">
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" />
                    : <span>{c.username?.[0]?.toUpperCase()}</span>
                  }
                </div>
                <div className="convo-info">
                  <div className="convo-header">
                    <span className="convo-name">{c.username}</span>
                    <span className="convo-time">{timeAgo(c.last_message_at)}</span>
                  </div>
                  <p className="convo-preview">
                    {c.sender_id === user?.id ? 'You: ' : ''}{c.last_message}
                  </p>
                </div>
                {parseInt(c.unread_count) > 0 && (
                  <span className="unread-count">{c.unread_count}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="thread-panel card">
        {!userId ? (
          <div className="thread-empty">
            <p style={{ fontSize: '2rem' }}>✉</p>
            <p>Select a conversation</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>
              Browse nearby players to start a new chat
            </p>
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/players')}>
              Find Players
            </button>
          </div>
        ) : (
          <>
            <div className="thread-header">
              <div className="thread-user" onClick={() => thread && navigate(`/profile/${thread.id}`)}>
                <div className="convo-avatar">
                  {thread?.avatar_url
                    ? <img src={thread.avatar_url} alt="" />
                    : <span>{thread?.username?.[0]?.toUpperCase()}</span>
                  }
                </div>
                <div>
                  <span className="thread-name">{thread?.username}</span>
                  {thread?.rating && (
                    <span className="thread-rating">{thread.rating}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/profile/${userId}`)}>
                  Profile
                </button>
                <button className="btn btn-danger btn-sm" onClick={async () => {
                  await api.messages.block(userId);
                  navigate('/messages');
                }}>
                  Block
                </button>
              </div>
            </div>

            <div className="messages-list">
              {messages.map((msg) => {
                const isMe = msg.sender_id === user?.id;
                return (
                  <div key={msg.id} className={`message ${isMe ? 'mine' : 'theirs'}`}>
                    <div className="message-bubble">{msg.content}</div>
                    <div className="message-time">{timeAgo(msg.created_at)}</div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form className="message-input" onSubmit={sendMessage}>
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type a message..."
                maxLength={2000}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={sending || !content.trim()}>
                {sending ? <span className="spinner" /> : '→'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
