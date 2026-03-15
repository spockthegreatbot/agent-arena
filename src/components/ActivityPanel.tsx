'use client';

import { useEffect, useRef, useState } from 'react';
import { AgentState, ActivityItem, SystemStats, RoomId, ActivityType } from '@/lib/agents';

interface ActivityPanelProps {
  agents: AgentState[];
  activities: ActivityItem[];
  stats: SystemStats | null;
}

const ROOM_LABELS: Record<RoomId, { emoji: string; name: string }> = {
  main_office: { emoji: '🏢', name: 'Office' },
  meeting_room: { emoji: '🤝', name: 'Meeting' },
  kitchen: { emoji: '☕', name: 'Kitchen' },
  game_room: { emoji: '🎮', name: 'Game' },
  server_room: { emoji: '🖥️', name: 'Server' },
};

const TYPE_CONFIG: Record<ActivityType, { borderColor: string; icon: string; dimmed?: boolean }> = {
  regular:       { borderColor: 'transparent', icon: '💬' },
  task_complete: { borderColor: '#22c55e', icon: '✅' },
  deploy:        { borderColor: '#3b82f6', icon: '🚀' },
  alert:         { borderColor: '#ef4444', icon: '⚠️' },
  scanning:      { borderColor: 'transparent', icon: '🔄', dimmed: true },
  security:      { borderColor: '#f59e0b', icon: '🛡️' },
  interaction:   { borderColor: '#8b5cf6', icon: '🤝' },
};

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  } catch { return ''; }
}

function groupByRoom(agents: AgentState[]): Record<RoomId, number> {
  const counts: Record<RoomId, number> = {
    main_office: 0, meeting_room: 0, kitchen: 0, game_room: 0, server_room: 0,
  };
  for (const a of agents) {
    if (counts[a.room] !== undefined) counts[a.room]++;
    else counts.main_office++;
  }
  return counts;
}

function CompactMessage({ item }: { item: ActivityItem }) {
  const config = TYPE_CONFIG[item.type];
  const agentColor = item.agentColor || '#9ca3af';
  const hasBorder = config.borderColor !== 'transparent';

  return (
    <div
      className="flex items-start gap-1.5 py-1 px-2 hover:bg-[#1a1a2e]/60 rounded transition-colors"
      style={{
        borderLeft: hasBorder ? `2px solid ${config.borderColor}` : '2px solid transparent',
        opacity: config.dimmed ? 0.5 : 1,
      }}
    >
      <span className="text-[10px] shrink-0 mt-px">{item.agentEmoji}</span>
      <div className="flex-1 min-w-0">
        <span className="font-bold text-[10px]" style={{ color: agentColor }}>{item.agentName} </span>
        <span className="text-[11px] text-[#b0b0c0] leading-tight">{item.message}</span>
      </div>
      <span className="shrink-0 text-[9px] text-[#4b5563] font-mono mt-0.5">{relativeTime(item.timestamp)}</span>
    </div>
  );
}

export default function ActivityPanel({ agents, activities, stats }: ActivityPanelProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const prevCountRef = useRef(0);
  const activeCount = agents.filter(a => a.status === 'active').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;
  const offlineCount = agents.filter(a => a.status === 'offline').length;
  const roomCounts = groupByRoom(agents);

  const sortedActivities = [...activities]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-40);

  useEffect(() => {
    if (autoScroll && feedRef.current && activities.length !== prevCountRef.current) {
      feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevCountRef.current = activities.length;
  }, [activities.length, autoScroll]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      setAutoScroll(atBottom);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: '#0f0f1a' }}>
      {/* Compact Header */}
      <div className="px-3 py-2 border-b border-[#1e1e30] flex items-center justify-between">
        <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
          ⚡ Arena
        </h1>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] bg-[#22c55e22] text-[#22c55e] px-1.5 py-0.5 rounded-full">{activeCount}</span>
          {idleCount > 0 && <span className="text-[10px] bg-[#eab30822] text-[#eab308] px-1.5 py-0.5 rounded-full">{idleCount}</span>}
          {offlineCount > 0 && <span className="text-[10px] bg-[#6b728022] text-[#6b7280] px-1.5 py-0.5 rounded-full">{offlineCount}</span>}
        </div>
      </div>

      {/* Room counts — single compact line */}
      <div className="px-3 py-1 border-b border-[#1e1e30] flex items-center gap-2 text-[10px] text-[#6b7280]">
        {Object.entries(roomCounts).map(([roomId, count]) => {
          if (count === 0) return null;
          const room = ROOM_LABELS[roomId as RoomId];
          return <span key={roomId}>{room.emoji}{count}</span>;
        })}
        <span className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] text-[#22c55e]">LIVE</span>
        </span>
      </div>

      {/* Agent strip — compact horizontal avatars */}
      <div className="px-2 py-1.5 border-b border-[#1e1e30] flex items-center gap-1 overflow-x-auto">
        {agents.map(agent => {
          const isActive = agent.status === 'active';
          const isIdle = agent.status === 'idle';
          const dotColor = isActive ? 'bg-green-500' : isIdle ? 'bg-yellow-500' : 'bg-gray-600';
          const isExpanded = expandedAgent === agent.id;

          return (
            <button
              key={agent.id}
              onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
              className="relative shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-all hover:bg-[#1a1a2e]"
              style={{
                backgroundColor: isExpanded ? agent.color + '22' : 'transparent',
                border: isExpanded ? `1px solid ${agent.color}44` : '1px solid transparent',
              }}
            >
              <span className="text-xs">{agent.emoji}</span>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${dotColor} border border-[#0f0f1a]`} />
              {isExpanded && (
                <span className="text-[10px] font-medium text-[#d0d0d0]">{agent.name}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded agent detail */}
      {expandedAgent && (() => {
        const agent = agents.find(a => a.id === expandedAgent);
        if (!agent) return null;
        const room = ROOM_LABELS[agent.room];
        return (
          <div className="px-3 py-2 border-b border-[#1e1e30] bg-[#12121f]">
            <div className="flex items-center gap-2">
              <span>{agent.emoji}</span>
              <span className="text-xs font-bold text-white">{agent.name}</span>
              <span className="text-[10px] text-[#6b7280]">{agent.role}</span>
              <span className="text-[10px] ml-auto" style={{ color: agent.color }}>{room?.emoji} {room?.name}</span>
            </div>
            {agent.currentTask && (
              <p className="text-[10px] text-[#9ca3af] mt-1 truncate">📝 {agent.currentTask}</p>
            )}
            <p className="text-[9px] text-[#4b5563] mt-0.5">{agent.model} · {agent.lastActiveRelative}</p>
          </div>
        );
      })()}

      {/* Chat Feed — the main content */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto py-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {sortedActivities.length === 0 ? (
          <p className="text-[10px] text-[#4b5563] text-center py-6">Waiting for activity...</p>
        ) : (
          sortedActivities.map((item, i) => (
            <CompactMessage key={i} item={item} />
          ))
        )}
      </div>

      {/* System Stats — minimal footer */}
      {stats && (
        <div className="px-3 py-1.5 border-t border-[#1e1e30] flex items-center gap-3 text-[9px] text-[#4b5563] bg-[#0a0a14]">
          <span>CPU {stats.cpuLoad.toFixed(1)}</span>
          <span>RAM {Math.round(stats.ramUsed / 1024)}G/{Math.round(stats.ramTotal / 1024)}G</span>
          <span className="ml-auto">Up {stats.uptime}</span>
        </div>
      )}
    </div>
  );
}
