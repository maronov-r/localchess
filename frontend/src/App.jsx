import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WsProvider } from './context/WsContext';
import Layout from './components/layout/Layout';

import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import CalibrationPage from './pages/CalibrationPage';
import DashboardPage from './pages/DashboardPage';
import PlayersPage from './pages/PlayersPage';
import PostsPage from './pages/PostsPage';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import GamesPage from './pages/GamesPage';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const token = localStorage.getItem('token');

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  return (
    <WsProvider token={token}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignupPage />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="players" element={<PlayersPage />} />
            <Route path="posts" element={<PostsPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:id" element={<EventDetailPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="messages/:userId" element={<MessagesPage />} />
            <Route path="games" element={<GamesPage />} />
            <Route path="profile/:id" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="calibration" element={<CalibrationPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
