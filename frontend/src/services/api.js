const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BASE = `${SUPABASE_URL}/functions/v1/api`;

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),

  auth: {
    signup: (body) => api.post('/auth/signup', body),
    login: (body) => api.post('/auth/login', body),
    me: () => api.get('/auth/me'),
    updateProfile: (body) => api.put('/auth/me', body),
  },
  users: {
    nearby: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return api.get(`/users/nearby${qs ? '?' + qs : ''}`);
    },
    get: (id) => api.get(`/users/${id}`),
  },
  posts: {
    create: (body) => api.post('/posts', body),
    nearby: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return api.get(`/posts/nearby${qs ? '?' + qs : ''}`);
    },
    mine: () => api.get('/posts/mine'),
    updateStatus: (id, status) => api.patch(`/posts/${id}/status`, { status }),
    delete: (id) => api.delete(`/posts/${id}`),
  },
  events: {
    create: (body) => api.post('/events', body),
    nearby: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return api.get(`/events/nearby${qs ? '?' + qs : ''}`);
    },
    mine: () => api.get('/events/mine'),
    get: (id) => api.get(`/events/${id}`),
    signup: (id) => api.post(`/events/${id}/signup`),
    cancelSignup: (id) => api.delete(`/events/${id}/signup`),
    update: (id, body) => api.put(`/events/${id}`, body),
  },
  games: {
    report: (body) => api.post('/games', body),
    confirm: (id) => api.post(`/games/${id}/confirm`),
    history: () => api.get('/games/history'),
  },
  calibration: {
    start: (botLevel) => api.post('/calibration/start', { botLevel }),
    move: (sessionId, move) => api.post('/calibration/move', { sessionId, move }),
    resign: (sessionId) => api.post('/calibration/resign', { sessionId }),
    status: () => api.get('/calibration/status'),
    finalize: () => api.post('/calibration/finalize'),
  },
  messages: {
    send: (recipient_id, content) => api.post('/messages', { recipient_id, content }),
    conversations: () => api.get('/messages/conversations'),
    thread: (userId, params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return api.get(`/messages/${userId}${qs ? '?' + qs : ''}`);
    },
    block: (userId) => api.post(`/messages/block/${userId}`),
    unblock: (userId) => api.delete(`/messages/block/${userId}`),
  },
  notifications: {
    list: () => api.get('/notifications'),
    unreadCount: () => api.get('/notifications/unread-count'),
    markRead: (id) => api.patch(`/notifications/${id}/read`),
    markAllRead: () => api.patch('/notifications/read-all'),
  },
};

export default api;
