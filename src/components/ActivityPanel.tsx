'use client';

import { AgentState, ActivityItem, SystemStats, RoomId } from '@/lib/agents';

interface ActivityPanelProps {
  agents: AgentState[];
  activities: ActivityItem[];
  stats: SystemStats | null;
}

const ROOM_LABELS: Record<RoomId, { emoji: string; name: string }> = {
  main_office: { emoji: '🏢', name: 'Main Office' },
  meeting_room: { emoji: '🤝', name: 'Meeting Room' },
  kitchen: { emoji: '🍳', name: 'Kitchen' },
  game_room: { emoji: '🎮', name: 'Game Room' },
  server_room: { emoji: '🖥️', name: 'Server Room' },
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

function groupByRoom(agents: AgentState[]): Record<RoomId, AgentState[]> {
  const groups: Record<RoomId, AgentState[]> = {
    main_office: [],
    meeting_room: [],
    kitchen: [],
    game_room: [],
    server_room: [],
  };
  for (const a of agents) {
    if (groups[a.room]) {
      groups[a.room].push(a);
    } else {
      groups.main_office.push(a);
    }
  }
  return groups;
}

export default function ActivityPanel({ agents, activities, stats }: ActivityPanelProps) {
  const activeCount = agents.filter(a => a.status === 'active').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;
  const roomGroups = groupByRoom(agents);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a3e] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">
            ⚡ Agent Arena
          </h1>
          <p className="text-xs text-[#6b7280]">
            {new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {stats ? ` • Up ${stats.uptime}` : ''}
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

      {/* Room Occupancy */}
      <div className="px-4 py-2 border-b border-[#2a2a3e]">
        <h2 className="text-sm font-semibold text-[#9ca3af] mb-2">🗺️ Room Occupancy</h2>
        <div className="space-y-1">
          {Object.entries(roomGroups).map(([roomId, roomAgents]) => {
            if (roomAgents.length === 0) return null;
            const room = ROOM_LABELS[roomId as RoomId];
            return (
              <div key={roomId} className="flex items-center gap-2 text-xs">
                <span className="shrink-0 w-4">{room.emoji}</span>
                <span className="text-[#6b7280] shrink-0 w-24">{room.name}:</span>
                <span className="text-[#d0d0d0] truncate">
                  {roomAgents.map(a => {
                    const suffix = a.status === 'offline' ? ' 💤' : a.status === 'idle' ? ' ☕' : '';
                    return `${a.emoji} ${a.name}${suffix}`;
                  }).join(', ')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-[#2a2a3e]">
          <h2 className="text-sm font-semibold text-[#9ca3af]">📡 Activity Feed</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {activities.length === 0 ? (
            <p className="text-xs text-[#4b5563] text-center py-4">No recent activity</p>
          ) : (
            activities.slice(0, 20).map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded hover:bg-[#1a1a2e] transition-colors">
                <span className="text-[#4b5563] shrink-0 font-mono">{formatTime(item.timestamp)}</span>
                <span className="shrink-0">{item.agentEmoji}</span>
                <span className="text-[#9ca3af]">
                  <span className="text-[#e0e0e0] font-medium">{item.agentName}:</span>{' '}
                  {item.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Agent Cards Grid */}
      <div className="border-t border-[#2a2a3e]">
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
        <div className="px-4 py-2 border-t border-[#2a2a3e] flex items-center gap-4 text-[10px] text-[#6b7280] bg-[#0d0d14]">
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
        backgroundColor: '#1a1a2e',
        borderColor: agent.status === 'active' ? agent.color + '44' : '#2a2a3e',
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
