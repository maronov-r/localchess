import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

const WsContext = createContext(null);

export function WsProvider({ token, children }) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Map());
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (!token) return;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/ws?token=${token}`;
    const socket = new WebSocket(url);

    socket.onopen = () => {
      setConnected(true);
      // Heartbeat
      const ping = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
      socket._pingInterval = ping;
    };

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const handlers = listeners.current.get(data.type) || [];
        handlers.forEach((h) => h(data));
        const allHandlers = listeners.current.get('*') || [];
        allHandlers.forEach((h) => h(data));
      } catch {
        // ignore
      }
    };

    socket.onclose = () => {
      setConnected(false);
      clearInterval(socket._pingInterval);
      if (token) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    socket.onerror = () => socket.close();
    ws.current = socket;
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (ws.current) ws.current.close();
    };
  }, [connect]);

  const subscribe = useCallback((type, handler) => {
    const map = listeners.current;
    if (!map.has(type)) map.set(type, []);
    map.get(type).push(handler);
    return () => {
      const arr = map.get(type) || [];
      map.set(type, arr.filter((h) => h !== handler));
    };
  }, []);

  return (
    <WsContext.Provider value={{ connected, subscribe }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWs() {
  return useContext(WsContext);
}
