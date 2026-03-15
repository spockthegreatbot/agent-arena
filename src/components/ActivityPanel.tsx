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

const TYPE_CONFIG: Record<ActivityType, { borderColor: string; icon: string; dimmed?: boolean; large?: boolean }> = {
  regular:       { borderColor: 'transparent', icon: '💬' },
  task_complete: { borderColor: '#22c55e', icon: '✅' },
  deploy:        { borderColor: '#3b82f6', icon: '🚀', large: true },
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
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function getTimeBucket(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 5) return 'Just now';
    if (mins < 15) return '5 minutes ago';
    if (mins < 30) return '15 minutes ago';
    if (mins < 60) return '30 minutes ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 2) return '1 hour ago';
    if (hrs < 6) return `${hrs} hours ago`;
    if (hrs < 24) return 'Earlier today';
    return 'Yesterday';
  } catch {
    return '';
  }
}

function groupByRoom(agents: AgentState[]): Record<RoomId, number> {
  const counts: Record<RoomId, number> = {
    main_office: 0,
    meeting_room: 0,
    kitchen: 0,
    game_room: 0,
    server_room: 0,
  };
  for (const a of agents) {
    if (counts[a.room] !== undefined) counts[a.room]++;
    else counts.main_office++;
  }
  return counts;
}

/** Detect if two consecutive activities from different agents are close in time (interaction) */
function detectInteractions(items: ActivityItem[]): ActivityItem[] {
  const result = [...items];
  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1];
    const curr = result[i];
    if (prev.agentId !== curr.agentId) {
      const timeDiff = Math.abs(new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime());
      if (timeDiff < 120000) { // within 2 minutes
        // Check if messages reference each other's agent
        const prevNameLower = prev.agentName.toLowerCase();
        const currNameLower = curr.agentName.toLowerCase();
        const currMsgLower = curr.message.toLowerCase();
        const prevMsgLower = prev.message.toLowerCase();
        if (currMsgLower.includes(prevNameLower) || prevMsgLower.includes(currNameLower)) {
          result[i] = { ...curr, type: 'interaction', replyToAgent: prev.agentName };
        }
      }
    }
  }
  return result;
}

function ChatMessage({ item, isThread }: { item: ActivityItem; isThread: boolean }) {
  const config = TYPE_CONFIG[item.type];
  const agentColor = item.agentColor || '#9ca3af';
  const hasBorder = config.borderColor !== 'transparent';

  return (
    <div
      className={`group flex items-start gap-2.5 py-1.5 px-3 rounded-md transition-colors hover:bg-[#1a1a2e]/80 ${isThread ? 'ml-8' : ''}`}
      style={{
        borderLeft: hasBorder ? `3px solid ${config.borderColor}` : '3px solid transparent',
        opacity: config.dimmed ? 0.55 : 1,
      }}
    >
      {/* Avatar */}
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs mt-0.5"
        style={{ backgroundColor: agentColor + '22', border: `1.5px solid ${agentColor}44` }}
      >
        {item.agentEmoji}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-xs" style={{ color: agentColor }}>
            {item.agentName}
          </span>
          {isThread && item.replyToAgent && (
            <span className="text-[10px] text-[#6b7280]">↩ replying to {item.replyToAgent}</span>
          )}
        </div>
        <p
          className={`text-[#c8c8d0] leading-snug mt-0.5 break-words ${config.large ? 'text-[13px] font-medium' : 'text-xs'}`}
        >
          {item.message}
        </p>
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-[10px] text-[#4b5563] font-mono mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {relativeTime(item.timestamp)}
      </span>
    </div>
  );
}

function TimeDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3">
      <div className="flex-1 h-px bg-[#2a2a3e]" />
      <span className="text-[10px] text-[#4b5563] font-mono shrink-0">— {label} —</span>
      <div className="flex-1 h-px bg-[#2a2a3e]" />
    </div>
  );
}

export default function ActivityPanel({ agents, activities, stats }: ActivityPanelProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevCountRef = useRef(0);
  const activeCount = agents.filter(a => a.status === 'active').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;
  const roomCounts = groupByRoom(agents);

  // Reverse so newest is at bottom, then detect interactions
  const sortedActivities = [...activities]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-30);
  const processedActivities = detectInteractions(sortedActivities);

  // Build time-bucketed groups
  const bucketedItems: { bucket: string; items: ActivityItem[] }[] = [];
  let currentBucket = '';
  for (const item of processedActivities) {
    const bucket = getTimeBucket(item.timestamp);
    if (bucket !== currentBucket) {
      currentBucket = bucket;
      bucketedItems.push({ bucket, items: [item] });
    } else {
      bucketedItems[bucketedItems.length - 1].items.push(item);
    }
  }

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScroll && feedRef.current && activities.length !== prevCountRef.current) {
      feedRef.current.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevCountRef.current = activities.length;
  }, [activities.length, autoScroll]);

  // Detect manual scroll-up to pause auto-scroll
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
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1e1e30] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            ⚡ Agent Arena
          </h1>
          <p className="text-xs text-[#6b7280]">
            {stats ? `Up ${stats.uptime}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-[#22c55e22] text-[#22c55e] px-2 py-1 rounded-full">
            {activeCount} active
          </span>
          {idleCount > 0 && (
            <span className="text-xs bg-[#eab30822] text-[#eab308] px-2 py-1 rounded-full">
              {idleCount} idle
            </span>
          )}
        </div>
      </div>

      {/* Room Count Bar */}
      <div className="px-4 py-1.5 border-b border-[#1e1e30] flex items-center gap-3 text-[11px] text-[#9ca3af] flex-wrap">
        {Object.entries(roomCounts).map(([roomId, count]) => {
          if (count === 0) return null;
          const room = ROOM_LABELS[roomId as RoomId];
          return (
            <span key={roomId}>
              {room.emoji} {room.name}: {count}
            </span>
          );
        })}
      </div>

      {/* LIVE indicator + Feed header */}
      <div className="px-4 py-2 border-b border-[#1e1e30] flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <span className="text-[11px] font-semibold text-[#22c55e] uppercase tracking-wider">Live</span>
        <span className="text-[10px] text-[#4b5563] ml-auto font-mono">
          {processedActivities.length} messages
        </span>
      </div>

      {/* Chat Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto py-2"
        style={{ scrollBehavior: 'smooth' }}
      >
        {processedActivities.length === 0 ? (
          <p className="text-xs text-[#4b5563] text-center py-8">Waiting for activity...</p>
        ) : (
          bucketedItems.map((group, gi) => (
            <div key={gi}>
              <TimeDivider label={group.bucket} />
              {group.items.map((item, ii) => (
                <ChatMessage
                  key={`${gi}-${ii}`}
                  item={item}
                  isThread={item.type === 'interaction'}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Agent Cards Grid */}
      <div className="border-t border-[#1e1e30]">
        <div className="px-4 py-2">
          <h2 className="text-sm font-semibold text-[#9ca3af]">👥 Agents</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 px-3 pb-3 max-h-[250px] overflow-y-auto">
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* System Stats Bar */}
      {stats && (
        <div className="px-4 py-2 border-t border-[#1e1e30] flex items-center gap-4 text-[10px] text-[#6b7280] bg-[#0a0a14]">
          <span>CPU: {stats.cpuLoad.toFixed(1)}</span>
          <span>RAM: {stats.ramUsed}MB/{stats.ramTotal}MB</span>
          <span>Disk: {stats.diskUsed}G/{stats.diskTotal}G</span>
          <span>Sessions: {stats.sessionsToday}</span>
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentState }) {
  const statusDot = agent.status === 'active'
    ? 'bg-green-500 shadow-green-500/50 shadow-sm animate-pulse'
    : agent.status === 'idle'
      ? 'bg-yellow-500'
      : 'bg-gray-600';

  const room = ROOM_LABELS[agent.room];

  return (
    <div
      className="p-2.5 rounded-lg border transition-all hover:border-opacity-60"
      style={{
        backgroundColor: '#12121f',
        borderColor: agent.status === 'active' ? agent.color + '44' : '#1e1e30',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{agent.emoji}</span>
        <span className="text-xs font-bold text-white">{agent.name}</span>
        <span className={`w-2 h-2 rounded-full ${statusDot} ml-auto`} />
      </div>
      <p className="text-[10px] text-[#6b7280] mb-1">{agent.role}</p>
      <div className="flex items-center justify-between">
        <span className="text-[10px]" style={{ color: agent.color }}>{room?.emoji} {room?.name}</span>
        <span className="text-[10px] text-[#4b5563]">{agent.lastActiveRelative}</span>
      </div>
      {agent.status === 'active' && agent.currentTask && (
        <p className="text-[9px] text-[#9ca3af] mt-1 truncate">
          📝 {agent.currentTask.substring(0, 50)}
        </p>
      )}
    </div>
  );
}
