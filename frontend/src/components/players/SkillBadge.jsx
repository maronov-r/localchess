import React from 'react';

const LEVELS = [
  { max: 800, label: 'Beginner', color: '#a0522d' },
  { max: 1000, label: 'Bronze', color: '#CD7F32' },
  { max: 1200, label: 'Silver', color: '#9090a8' },
  { max: 1400, label: 'Gold', color: '#d4af37' },
  { max: 1600, label: 'Platinum', color: '#8ab4cc' },
  { max: 1800, label: 'Diamond', color: '#7ec8d8' },
  { max: 2000, label: 'Master', color: '#9B59B6' },
  { max: Infinity, label: 'Grandmaster', color: '#E74C3C' },
];

export default function SkillBadge({ rating }) {
  if (!rating) return null;
  const level = LEVELS.find((l) => rating < l.max) || LEVELS[LEVELS.length - 1];
  return (
    <span
      className="badge"
      style={{
        background: level.color + '22',
        color: level.color,
        border: `1px solid ${level.color}44`,
      }}
    >
      {level.label}
    </span>
  );
}
