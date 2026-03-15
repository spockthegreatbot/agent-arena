export interface AgentConfig {
  id: string;       // Must match the OpenClaw agent directory name in ~/.openclaw/agents/<id>/
  name: string;     // Display name shown in the office and activity feed
  emoji: string;    // Emoji icon for the agent
  role: string;     // Short role description (e.g. "Full-Stack Dev", "Security")
  model: string;    // AI model the agent uses (display only)
  color: string;    // Hex color for the agent's pixel art and UI elements
  desk: string;     // Desk position identifier in the office layout
  accessory: 'glasses' | 'hat' | 'badge' | 'headphones' | 'scarf' | 'cap' | 'bowtie' | 'visor' | 'antenna' | 'crown' | 'monocle';
}

/**
 * ============================================
 * 🏟️ CUSTOMIZE YOUR AGENTS HERE
 * ============================================
 *
 * Each agent needs:
 *   - id: matches the OpenClaw agent folder name (e.g. 'dev' → ~/.openclaw/agents/dev/)
 *   - name: whatever you want to call them
 *   - emoji: pick any emoji
 *   - role: short description
 *   - model: which AI model they use (cosmetic)
 *   - color: hex color for their pixel art character
 *   - desk: position in the office ('command', 'dev', 'trading', 'research', 'design',
 *           'security', 'content', 'strategy', 'engineering', 'pm', 'finance')
 *   - accessory: visual flair on their pixel character
 *
 * To add a new agent: copy any line below and change the values.
 * To remove one: delete the line.
 * The office auto-adjusts to however many agents you have.
 */
export const AGENTS: AgentConfig[] = [
  { id: 'main', name: 'Spock', emoji: '🖖', role: 'Lead Operator', model: 'Claude Sonnet 4.6', color: '#9333ea', desk: 'command', accessory: 'crown' },
  { id: 'dev', name: 'Scotty', emoji: '🔧', role: 'Full-Stack Dev', model: 'Claude Opus 4.6', color: '#3b82f6', desk: 'dev', accessory: 'glasses' },
  { id: 'trader', name: 'Gordon', emoji: '🎯', role: 'Trader', model: 'GPT-5-mini', color: '#22c55e', desk: 'trading', accessory: 'visor' },
  { id: 'research', name: 'Watson', emoji: '🔍', role: 'Research', model: 'GPT-5', color: '#14b8a6', desk: 'research', accessory: 'monocle' },
  { id: 'creative', name: 'Nova', emoji: '🎨', role: 'Creative Director', model: 'GPT-5', color: '#ec4899', desk: 'design', accessory: 'bowtie' },
  { id: 'audit', name: 'Cipher', emoji: '🛡️', role: 'Security', model: 'GPT-4.1-mini', color: '#ef4444', desk: 'security', accessory: 'badge' },
  { id: 'social', name: 'Oscar', emoji: '✍️', role: 'Content', model: 'GPT-5-mini', color: '#f97316', desk: 'content', accessory: 'headphones' },
  { id: 'growth', name: 'Rex', emoji: '📊', role: 'Growth', model: 'GPT-5', color: '#eab308', desk: 'strategy', accessory: 'cap' },
  { id: 'rook', name: 'Rook', emoji: '⚡', role: 'Engineer', model: 'GPT-5.4', color: '#6b7280', desk: 'engineering', accessory: 'antenna' },
  { id: 'pm', name: 'Atlas', emoji: '📋', role: 'PM', model: 'GPT-4.1-mini', color: '#06b6d4', desk: 'pm', accessory: 'hat' },
  { id: 'finance', name: 'Ledger', emoji: '💰', role: 'Finance', model: 'GPT-4.1-mini', color: '#94a3b8', desk: 'finance', accessory: 'scarf' },
];

export type AgentStatus = 'active' | 'idle' | 'offline';
export type RoomId = 'main_office' | 'meeting_room' | 'kitchen' | 'game_room' | 'server_room';

export interface AgentState {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  color: string;
  desk: string;
  accessory: string;
  status: AgentStatus;
  lastActive: string | null;
  lastActiveRelative: string;
  currentTask: string | null;
  idleMinutes: number;
  room: RoomId;
}

export type ActivityType = 'regular' | 'task_complete' | 'deploy' | 'alert' | 'scanning' | 'security' | 'interaction';

export interface ActivityItem {
  timestamp: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  agentColor?: string;
  message: string;
  type: ActivityType;
  replyToAgent?: string;
}

export interface SystemStats {
  cpuLoad: number;
  ramUsed: number;
  ramTotal: number;
  diskUsed: number;
  diskTotal: number;
  activeAgents: number;
  sessionsToday: number;
  uptime: string;
}

/** Determine which room an agent belongs in based on status */
export function getAgentRoom(agent: { status: AgentStatus; idleMinutes: number }): RoomId {
  if (agent.status === 'active') return 'main_office';
  if (agent.status === 'idle' && agent.idleMinutes > 5 && agent.idleMinutes <= 15) return 'kitchen';
  if (agent.status === 'idle' && agent.idleMinutes > 15) return 'game_room';
  if (agent.status === 'offline') return 'game_room';
  return 'main_office';
}
