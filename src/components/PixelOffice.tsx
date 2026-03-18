'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { AgentState, RoomId, ActivityItem, AGENTS } from '@/lib/agents';

// ===== CANVAS DIMENSIONS =====
const W = 960;
const H = 720;

// ===== COLOR HELPERS =====
function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 255) * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}

function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor(((num >> 16) & 255) * (1 + amount)));
  const g = Math.min(255, Math.floor(((num >> 8) & 255) * (1 + amount)));
  const b = Math.min(255, Math.floor((num & 255) * (1 + amount)));
  return `rgb(${r},${g},${b})`;
}

// ===== ISOMETRIC HELPERS =====
// Tile dimensions (2:1 ratio standard)
const ISO_TW = 48;
const ISO_TH = 24;

function drawIsoDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  tw: number, th: number,
  color: string,
  strokeColor?: string
) {
  const twh = tw / 2, thh = th / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - thh);
  ctx.lineTo(cx + twh, cy);
  ctx.lineTo(cx, cy + thh);
  ctx.lineTo(cx - twh, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  tw: number, th: number, bh: number,
  topColor: string, leftColor: string, rightColor: string,
  outline?: string
) {
  const twh = tw / 2, thh = th / 2;

  // Top face
  ctx.beginPath();
  ctx.moveTo(cx, cy - thh);
  ctx.lineTo(cx + twh, cy);
  ctx.lineTo(cx, cy + thh);
  ctx.lineTo(cx - twh, cy);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 0.8; ctx.stroke(); }

  // Left face
  ctx.beginPath();
  ctx.moveTo(cx - twh, cy);
  ctx.lineTo(cx, cy + thh);
  ctx.lineTo(cx, cy + thh + bh);
  ctx.lineTo(cx - twh, cy + bh);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 0.8; ctx.stroke(); }

  // Right face
  ctx.beginPath();
  ctx.moveTo(cx + twh, cy);
  ctx.lineTo(cx, cy + thh);
  ctx.lineTo(cx, cy + thh + bh);
  ctx.lineTo(cx + twh, cy + bh);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 0.8; ctx.stroke(); }
}

// ===== ROOM LAYOUT =====
interface RoomDef {
  id: RoomId;
  label: string;
  emoji: string;
  x: number; y: number; w: number; h: number;
  floorColor1: string;
  floorColor2: string;
  tileSize: number;
}

const ROOMS: RoomDef[] = [
  { id: 'meeting_room', label: 'MEETING ROOM', emoji: '🤝', x: 0, y: 0, w: 480, h: 260, floorColor1: '#F2E4D0', floorColor2: '#E8D6BC', tileSize: 28 },
  { id: 'server_room', label: 'SERVER ROOM', emoji: '🖥️', x: 480, y: 0, w: 480, h: 260, floorColor1: '#EAD8C8', floorColor2: '#E2CEB8', tileSize: 24 },
  { id: 'main_office', label: 'MAIN OFFICE', emoji: '🏢', x: 0, y: 260, w: 960, h: 260, floorColor1: '#F5E6D3', floorColor2: '#EDD9C0', tileSize: 32 },
  { id: 'kitchen', label: 'KITCHEN', emoji: '🍳', x: 0, y: 520, w: 240, h: 200, floorColor1: '#F2E0CC', floorColor2: '#EAD4BA', tileSize: 26 },
  { id: 'game_room', label: 'GAME ROOM', emoji: '🎮', x: 240, y: 520, w: 340, h: 200, floorColor1: '#EDE0D0', floorColor2: '#E5D4C0', tileSize: 30 },
  { id: 'rest_room', label: 'REST ROOM', emoji: '😴', x: 580, y: 520, w: 380, h: 200, floorColor1: '#E8DDD0', floorColor2: '#E0D0BE', tileSize: 28 },
];

function getRoomDef(id: RoomId): RoomDef {
  return ROOMS.find(r => r.id === id) || ROOMS[2];
}

// ===== DESK POSITIONS =====
const DESK_LAYOUT: Record<string, { x: number; y: number; row: number }> = {
  command:     { x: 100, y: 310, row: 0 },
  dev:         { x: 240, y: 310, row: 0 },
  trading:     { x: 380, y: 310, row: 0 },
  research:    { x: 520, y: 310, row: 0 },
  design:      { x: 660, y: 310, row: 0 },
  security:    { x: 800, y: 310, row: 0 },
  content:     { x: 160, y: 420, row: 1 },
  strategy:    { x: 320, y: 420, row: 1 },
  engineering: { x: 480, y: 420, row: 1 },
  pm:          { x: 640, y: 420, row: 1 },
  finance:     { x: 800, y: 420, row: 1 },
};

const KITCHEN_SPOTS = [
  { x: 45, y: 595 }, { x: 110, y: 600 }, { x: 175, y: 595 },
  { x: 65, y: 650 }, { x: 140, y: 655 }, { x: 210, y: 650 },
];

const GAME_ROOM_SPOTS = [
  { x: 310, y: 585 }, { x: 390, y: 595 }, { x: 470, y: 585 },
  { x: 340, y: 650 }, { x: 420, y: 655 }, { x: 500, y: 650 },
  { x: 530, y: 595 }, { x: 365, y: 620 },
];

const REST_ROOM_SPOTS = [
  { x: 630, y: 580 }, { x: 720, y: 575 }, { x: 810, y: 580 },
  { x: 900, y: 575 }, { x: 660, y: 640 }, { x: 750, y: 645 },
  { x: 840, y: 640 }, { x: 930, y: 645 }, { x: 690, y: 690 },
  { x: 780, y: 695 }, { x: 870, y: 690 },
];

const SERVER_ROOM_SPOTS = [
  { x: 540, y: 100 }, { x: 620, y: 80 }, { x: 700, y: 100 },
  { x: 800, y: 80 }, { x: 880, y: 100 },
  { x: 570, y: 180 }, { x: 660, y: 170 }, { x: 750, y: 180 },
  { x: 840, y: 170 }, { x: 920, y: 180 },
];

const MEETING_SPOTS = [
  { x: 130, y: 100 }, { x: 210, y: 80 }, { x: 290, y: 100 },
  { x: 130, y: 160 }, { x: 210, y: 180 }, { x: 290, y: 160 },
  { x: 370, y: 100 }, { x: 370, y: 160 },
];

const DOORWAYS = [
  { x: 200, y: 250, w: 60, h: 20 },
  { x: 500, y: 250, w: 60, h: 20 },
  { x: 700, y: 250, w: 60, h: 20 },
  { x: 100, y: 510, w: 60, h: 20 },
  { x: 380, y: 510, w: 60, h: 20 },
  { x: 700, y: 510, w: 60, h: 20 },
];

// ===== AGENT ANIMATION STATE =====
interface AnimAgent {
  id: string;
  x: number; y: number;
  targetX: number; targetY: number;
  room: RoomId; targetRoom: RoomId;
  walkFrame: number;
  state: 'sitting' | 'walking' | 'standing' | 'sleeping' | 'coffee' | 'meeting' | 'gaming';
  gestureFrame: number;
  idleOffset: number;
}

// ===== PARTICLE / EFFECTS SYSTEM =====
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  type: 'confetti' | 'flash' | 'float';
  color?: string;
  emoji?: string;
  agentId: string;
  size?: number;
}

// ===== FOOTPRINT SYSTEM =====
interface Footprint {
  x: number; y: number;
  opacity: number;
  side: 'left' | 'right';
  createdAt: number;
}

// ===== EFFECT DEFINITIONS =====
const EFFECTS: Record<string, { type: string; colors?: string[]; color?: string; emoji?: string; count: number; duration: number; repeat?: number }> = {
  deploy:        { type: 'confetti', colors: ['#22c55e', '#3b82f6', '#eab308'], count: 15, duration: 2000 },
  blocked:       { type: 'flash', color: '#ef4444', count: 1, duration: 500, repeat: 3 },
  trade:         { type: 'float', emoji: '💰', count: 3, duration: 1500 },
  research_done: { type: 'float', emoji: '💡', count: 1, duration: 1000 },
  error:         { type: 'flash', color: '#ef4444', count: 1, duration: 300, repeat: 2 },
  review_pass:   { type: 'float', emoji: '✅', count: 1, duration: 1000 },
  review_fail:   { type: 'float', emoji: '❌', count: 1, duration: 1000 },
  coffee:        { type: 'float', emoji: '☕', count: 1, duration: 800 },
  idea:          { type: 'float', emoji: '💡', count: 2, duration: 1200 },
};

function detectEventType(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes('deployed') || lower.includes('shipped') || lower.includes('deploy')) return 'deploy';
  if (lower.includes('blocked')) return 'blocked';
  if (lower.includes('error') || lower.includes('failed') || lower.includes('crash')) return 'error';
  if (lower.includes('placed bet') || lower.includes('trade') || lower.includes('bought') || lower.includes('sold')) return 'trade';
  if (lower.includes('completed research') || lower.includes('research report') || lower.includes('research complete')) return 'research_done';
  if (lower.includes('approved') || lower.includes('review pass') || lower.includes('lgtm')) return 'review_pass';
  if (lower.includes('rejected') || lower.includes('review fail') || lower.includes('changes requested')) return 'review_fail';
  if (lower.includes('coffee') || lower.includes('break')) return 'coffee';
  if (lower.includes('idea') || lower.includes('eureka') || lower.includes('insight')) return 'idea';
  if (lower.includes('completed') || lower.includes('finished') || lower.includes('done')) return 'review_pass';
  return null;
}

// Monitor content types per agent desk
const MONITOR_CONTENT: Record<string, string> = {
  dev: 'green_code', trader: 'candle_chart', research: 'scrolling_data',
  creative: 'color_palette', growth: 'bar_chart', rook: 'terminal_blink',
  audit: 'shield_pulse', social: 'text_editor', main: 'dashboard',
  pm: 'kanban', finance: 'spreadsheet',
};

interface PixelOfficeProps {
  agents: AgentState[];
  activities?: ActivityItem[];
  onAgentClick?: (agentId: string) => void;
}

export default function PixelOffice({ agents, activities = [], onAgentClick }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);
  const agentAnimRef = useRef<Map<string, AnimAgent>>(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const footprintsRef = useRef<Footprint[]>([]);
  const flashAgentsRef = useRef<Map<string, { color: string; until: number; repeat: number }>>(new Map());
  const prevActivitiesRef = useRef<number>(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; agent: string; emoji: string; color: string; message: string; time: number }[]>([]);
  const toastIdRef = useRef(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ===== SPAWN PARTICLES FOR AN AGENT =====
  const spawnEffect = useCallback((agentId: string, effectKey: string) => {
    const effect = EFFECTS[effectKey];
    if (!effect) return;
    const anim = agentAnimRef.current.get(agentId);
    if (!anim) return;

    if (effect.type === 'confetti') {
      const colors = effect.colors || ['#fff'];
      for (let i = 0; i < effect.count; i++) {
        particlesRef.current.push({
          x: anim.x, y: anim.y - 10,
          vx: (Math.random() - 0.5) * 4,
          vy: -(Math.random() * 3 + 2),
          life: effect.duration / 16, maxLife: effect.duration / 16,
          type: 'confetti', color: colors[i % colors.length],
          agentId, size: 2 + Math.random() * 2,
        });
      }
    } else if (effect.type === 'flash') {
      flashAgentsRef.current.set(agentId, {
        color: effect.color || '#ef4444',
        until: Date.now() + effect.duration * (effect.repeat || 1),
        repeat: effect.repeat || 1,
      });
    } else if (effect.type === 'float') {
      for (let i = 0; i < effect.count; i++) {
        particlesRef.current.push({
          x: anim.x + (Math.random() - 0.5) * 10, y: anim.y - 15,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -(Math.random() * 0.5 + 0.5),
          life: effect.duration / 16, maxLife: effect.duration / 16,
          type: 'float', emoji: effect.emoji, agentId,
        });
      }
    }
  }, []);

  // ===== DETECT NEW ACTIVITIES AND TRIGGER EFFECTS + TOASTS =====
  useEffect(() => {
    if (activities.length > prevActivitiesRef.current && prevActivitiesRef.current > 0) {
      const newItems = activities.slice(prevActivitiesRef.current);
      for (const item of newItems) {
        const eventType = detectEventType(item.message);
        if (eventType) {
          spawnEffect(item.agentId, eventType);
        }
        toastIdRef.current++;
        setToasts(prev => {
          const next = [...prev, {
            id: toastIdRef.current,
            agent: item.agentName,
            emoji: item.agentEmoji,
            color: item.agentColor || '#9ca3af',
            message: item.message.substring(0, 60),
            time: Date.now(),
          }];
          return next.slice(-3);
        });
      }
    }
    prevActivitiesRef.current = activities.length;
  }, [activities, spawnEffect]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      setToasts(prev => prev.filter(t => Date.now() - t.time < 4000));
    }, 500);
    return () => clearInterval(timer);
  }, [toasts.length]);

  const getTargetPosition = useCallback((agent: AgentState, allAgents: AgentState[]): { x: number; y: number; state: AnimAgent['state'] } => {
    const room = agent.room;

    if (room === 'main_office') {
      const desk = DESK_LAYOUT[agent.desk];
      if (desk) return { x: desk.x, y: desk.y, state: 'sitting' };
      return { x: 480, y: 380, state: 'standing' };
    }
    if (room === 'meeting_room') {
      const meetingAgents = allAgents.filter(a => a.room === 'meeting_room');
      const idx = meetingAgents.findIndex(a => a.id === agent.id);
      const spot = MEETING_SPOTS[idx % MEETING_SPOTS.length];
      return { x: spot.x, y: spot.y, state: 'meeting' };
    }
    if (room === 'kitchen') {
      const kitchenAgents = allAgents.filter(a => a.room === 'kitchen');
      const idx = kitchenAgents.findIndex(a => a.id === agent.id);
      const spot = KITCHEN_SPOTS[idx % KITCHEN_SPOTS.length];
      return { x: spot.x, y: spot.y, state: 'coffee' };
    }
    if (room === 'server_room') {
      const serverAgents = allAgents.filter(a => a.room === 'server_room');
      const idx = serverAgents.findIndex(a => a.id === agent.id);
      const spot = SERVER_ROOM_SPOTS[idx % SERVER_ROOM_SPOTS.length];
      return { x: spot.x, y: spot.y, state: 'standing' };
    }
    if (room === 'game_room') {
      const gameAgents = allAgents.filter(a => a.room === 'game_room');
      const idx = gameAgents.findIndex(a => a.id === agent.id);
      const spot = GAME_ROOM_SPOTS[idx % GAME_ROOM_SPOTS.length];
      return { x: spot.x, y: spot.y, state: 'gaming' };
    }
    if (room === 'rest_room') {
      const sleepAgents = allAgents.filter(a => a.room === 'rest_room');
      const idx = sleepAgents.findIndex(a => a.id === agent.id);
      const spot = REST_ROOM_SPOTS[idx % REST_ROOM_SPOTS.length];
      return { x: spot.x, y: spot.y, state: 'sleeping' };
    }
    return { x: 480, y: 380, state: 'standing' };
  }, []);

  useEffect(() => {
    const animMap = agentAnimRef.current;
    for (const agent of agents) {
      const target = getTargetPosition(agent, agents);
      let anim = animMap.get(agent.id);
      if (!anim) {
        anim = {
          id: agent.id, x: target.x, y: target.y,
          targetX: target.x, targetY: target.y,
          room: agent.room, targetRoom: agent.room,
          walkFrame: 0, state: target.state,
          gestureFrame: 0, idleOffset: Math.random() * 1000,
        };
        animMap.set(agent.id, anim);
      } else {
        anim.targetX = target.x;
        anim.targetY = target.y;
        anim.targetRoom = agent.room;
        if (Math.abs(anim.x - target.x) < 3 && Math.abs(anim.y - target.y) < 3) {
          anim.state = target.state;
          anim.room = agent.room;
        } else {
          anim.state = 'walking';
        }
      }
    }
  }, [agents, getTargetPosition]);

  // ===== HOVER DETECTION =====
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const animMap = agentAnimRef.current;
    for (const agent of agents) {
      const anim = animMap.get(agent.id);
      if (!anim) continue;
      if (Math.abs(mx - anim.x) < 20 && Math.abs(my - anim.y) < 24) {
        const room = getRoomDef(agent.room);
        setTooltip({
          x: e.clientX, y: e.clientY,
          content: (
            <div style={{ borderLeft: `3px solid ${agent.color}` }} className="pl-2">
              <div className="font-bold text-white text-xs">{agent.emoji} {agent.name}</div>
              <div className="text-[10px] text-gray-400">{agent.role}</div>
              <div className="text-[10px]" style={{ color: agent.color }}>
                {agent.status === 'active' ? '🟢' : agent.status === 'idle' ? '🟡' : '⚫'} {agent.status} · {room.emoji} {room.label}
              </div>
              {agent.currentTask && <div className="text-[10px] text-gray-300 mt-0.5">📝 {agent.currentTask}</div>}
              {agent.lastActiveRelative && <div className="text-[10px] text-gray-500">Last: {agent.lastActiveRelative}</div>}
              <div className="text-[9px] text-gray-500 mt-0.5">{agent.model}</div>
            </div>
          ),
        });
        return;
      }
    }

    for (const room of ROOMS) {
      if (mx >= room.x && mx <= room.x + room.w && my >= room.y && my <= room.y + room.h) {
        const agentsInRoom = agents.filter(a => a.room === room.id);
        const names = agentsInRoom.map(a => a.name).join(', ') || 'empty';
        setTooltip({
          x: e.clientX, y: e.clientY,
          content: (
            <div>
              <div className="font-bold text-white text-xs">{room.emoji} {room.label}</div>
              <div className="text-[10px] text-gray-400">{names}</div>
            </div>
          ),
        });
        return;
      }
    }
    setTooltip(null);
  }, [agents]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ===== CLICK/TAP DETECTION =====
  const hitTestAgent = useCallback((clientX: number, clientY: number) => {
    if (!onAgentClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const mx = (clientX - rect.left) * scaleX;
    const my = (clientY - rect.top) * scaleY;
    const hitX = isMobile ? 28 : 22;
    const hitY = isMobile ? 36 : 28;

    const animMap = agentAnimRef.current;
    for (const agent of agents) {
      const anim = animMap.get(agent.id);
      if (!anim) continue;
      if (Math.abs(mx - anim.x) < hitX && Math.abs(my - anim.y) < hitY) {
        onAgentClick(agent.id);
        return;
      }
    }
  }, [agents, onAgentClick, isMobile]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    hitTestAgent(e.clientX, e.clientY);
  }, [hitTestAgent]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      hitTestAgent(touch.clientX, touch.clientY);
    }
  }, [hitTestAgent]);

  // ===== MAIN DRAW =====
  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    ctx.imageSmoothingEnabled = true;

    // Dark background outside rooms
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    for (const room of ROOMS) drawRoomFloor(ctx, room);
    drawWeatherWindows(ctx, frame);
    drawWalls(ctx);
    drawDoorways(ctx);
    drawBaseboards(ctx);
    for (const room of ROOMS) drawRoomLabel(ctx, room);

    drawMeetingRoom(ctx, frame);
    drawServerRoom(ctx, frame);
    drawMainOfficeDesks(ctx, frame, agents);
    drawKitchen(ctx, frame);
    drawGameRoom(ctx, frame);
    drawRestRoom(ctx, frame);
    drawWallDecorations(ctx, frame);
    drawDayNightOverlay(ctx);
    drawClock(ctx);

    // Footprints
    const now = Date.now();
    footprintsRef.current = footprintsRef.current.filter(fp => now - fp.createdAt < 4000);
    for (const fp of footprintsRef.current) {
      const age = (now - fp.createdAt) / 4000;
      ctx.fillStyle = `rgba(180,160,130,${0.25 * (1 - age)})`;
      const ox = fp.side === 'left' ? -2 : 2;
      ctx.beginPath();
      ctx.ellipse(fp.x + ox, fp.y, 2, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles
    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.type === 'confetti') p.vy += 0.12;
      const alpha = Math.max(0, p.life / p.maxLife);

      if (p.type === 'confetti') {
        ctx.fillStyle = p.color! + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.fillRect(p.x, p.y, p.size || 3, p.size || 3);
      } else if (p.type === 'float' && p.emoji) {
        ctx.globalAlpha = alpha;
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.emoji, p.x, p.y);
        ctx.globalAlpha = 1;
      }

      if (p.life <= 0) particles.splice(i, 1);
    }

    // Agents sorted by Y (back to front)
    const animMap = agentAnimRef.current;
    const sortedAgents = [...agents].sort((a, b) => {
      const aa = animMap.get(a.id);
      const ab = animMap.get(b.id);
      return (aa?.y || 0) - (ab?.y || 0);
    });

    for (const agent of sortedAgents) {
      const anim = animMap.get(agent.id);
      if (!anim) continue;

      const dx = anim.targetX - anim.x;
      const dy = anim.targetY - anim.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        const speed = Math.min(2.2, 0.5 + dist * 0.02);
        const prevX = anim.x;
        const prevY = anim.y;
        anim.x += (dx / dist) * speed;
        anim.y += (dy / dist) * speed;
        anim.walkFrame++;
        anim.state = 'walking';

        if (anim.walkFrame % 12 === 0) {
          footprintsRef.current.push({
            x: prevX, y: prevY + 22,
            opacity: 0.25,
            side: anim.walkFrame % 24 === 0 ? 'left' : 'right',
            createdAt: Date.now(),
          });
        }
      } else {
        anim.x = anim.targetX;
        anim.y = anim.targetY;
        anim.room = anim.targetRoom;
        const target = getTargetPosition(agent, agents);
        anim.state = target.state;
      }

      anim.gestureFrame = frame;

      // Flash effect
      const flash = flashAgentsRef.current.get(agent.id);
      if (flash && Date.now() < flash.until) {
        const elapsed = Date.now() - (flash.until - flash.repeat * 500);
        const phase = Math.floor(elapsed / 250) % 2;
        if (phase === 0) {
          ctx.fillStyle = flash.color + '44';
          ctx.beginPath();
          ctx.arc(anim.x, anim.y, 25, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        flashAgentsRef.current.delete(agent.id);
      }

      drawAgent(ctx, anim.x, anim.y, agent, anim, frame);
    }

    drawAmbient(ctx, frame);
    if (!isMobile) {
      drawMiniMap(ctx, agents, animMap);
    }
  }, [agents, getTargetPosition, isMobile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      frameRef.current++;
      drawFrame(ctx, frameRef.current);
      animRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [drawFrame]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-[#0a0a0f]">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="border border-[#2a2a3e] rounded-lg max-w-full max-h-full"
        style={{ imageRendering: 'auto', width: '100%', height: '100%', objectFit: 'contain' }}
        onMouseMove={!isMobile ? handleMouseMove : undefined}
        onMouseLeave={!isMobile ? handleMouseLeave : undefined}
        onClick={handleClick}
        onTouchEnd={handleTouchEnd}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg shadow-xl"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            backgroundColor: '#1a1a2eee',
            border: '1px solid #3a3a5e',
            maxWidth: 260,
          }}
        >
          {tooltip.content}
        </div>
      )}

      {/* Toast notifications */}
      <div className={`absolute flex flex-col gap-2 z-50 ${
        isMobile ? 'top-2 left-2 right-2' : 'bottom-4 right-4'
      }`} style={{ maxWidth: isMobile ? undefined : 280 }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-start gap-2 px-3 py-2 rounded-lg shadow-lg"
            style={{
              backgroundColor: '#1a1a2eee',
              borderLeft: `3px solid ${toast.color}`,
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            <span className="text-sm shrink-0">{toast.emoji}</span>
            <div className="min-w-0">
              <span className="font-bold text-[10px]" style={{ color: toast.color }}>{toast.agent} </span>
              <span className="text-[10px] text-gray-300">{toast.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== SHADOW =====
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== ISOMETRIC FLOOR =====
function drawRoomFloor(ctx: CanvasRenderingContext2D, room: RoomDef) {
  const { x: rx, y: ry, w: rw, h: rh, floorColor1, floorColor2 } = room;
  const twh = ISO_TW / 2;
  const thh = ISO_TH / 2;
  const ox = rx + rw / 2;
  const oy = ry + rh / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  // Solid background
  ctx.fillStyle = floorColor1;
  ctx.fillRect(rx, ry, rw, rh);

  const cRange = Math.ceil(rw / ISO_TW) + 4;
  const rRange = Math.ceil(rh / ISO_TH) + 4;

  for (let c = -cRange; c <= cRange; c++) {
    for (let r = -rRange; r <= rRange; r++) {
      const sx = ox + (c - r) * twh;
      const sy = oy + (c + r) * thh;

      // Cull off-screen tiles
      if (sx + twh < rx - 2 || sx - twh > rx + rw + 2) continue;
      if (sy + thh < ry - 2 || sy - thh > ry + rh + 2) continue;

      const isLight = (c + r) % 2 === 0;

      ctx.beginPath();
      ctx.moveTo(sx, sy - thh);
      ctx.lineTo(sx + twh, sy);
      ctx.lineTo(sx, sy + thh);
      ctx.lineTo(sx - twh, sy);
      ctx.closePath();
      ctx.fillStyle = isLight ? floorColor1 : floorColor2;
      ctx.fill();

      // Subtle grout lines
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Warm radial vignette
  const grad = ctx.createRadialGradient(ox, oy - 20, 10, ox, oy, Math.max(rw, rh) * 0.65);
  grad.addColorStop(0, 'rgba(255,248,235,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = grad;
  ctx.fillRect(rx, ry, rw, rh);

  ctx.restore();
}

// ===== WALLS (3D iso look) =====
function drawWalls(ctx: CanvasRenderingContext2D) {
  const wallFace = '#D4C4A8';
  const wallTop  = '#E8D5BC';
  const wallEdge = '#C4A882';
  const wallH = 14;

  // Outer border
  ctx.strokeStyle = wallEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Horizontal divider at y=260 (top rooms / main office)
  ctx.fillStyle = wallFace;
  ctx.fillRect(0, 260, W, wallH);
  ctx.fillStyle = wallTop;
  ctx.fillRect(0, 257, W, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 260 + wallH - 2, W, 2);

  // Horizontal divider at y=520 (main office / bottom rooms)
  ctx.fillStyle = wallFace;
  ctx.fillRect(0, 520, W, wallH);
  ctx.fillStyle = wallTop;
  ctx.fillRect(0, 517, W, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 520 + wallH - 2, W, 2);

  // Vertical divider at x=480 (meeting / server room)
  ctx.fillStyle = wallFace;
  ctx.fillRect(480, 0, 8, 260);
  ctx.fillStyle = wallTop;
  ctx.fillRect(478, 0, 4, 260);
  ctx.fillStyle = wallEdge;
  ctx.fillRect(488, 0, 1, 260);

  // Vertical divider at x=240 (kitchen / game room)
  ctx.fillStyle = wallFace;
  ctx.fillRect(240, 520, 8, H - 520);
  ctx.fillStyle = wallTop;
  ctx.fillRect(238, 520, 4, H - 520);
  ctx.fillStyle = wallEdge;
  ctx.fillRect(248, 520, 1, H - 520);

  // Vertical divider at x=580 (game room / rest room)
  ctx.fillStyle = wallFace;
  ctx.fillRect(580, 520, 8, H - 520);
  ctx.fillStyle = wallTop;
  ctx.fillRect(578, 520, 4, H - 520);
  ctx.fillStyle = wallEdge;
  ctx.fillRect(588, 520, 1, H - 520);

  // Glass tint for meeting room
  ctx.fillStyle = 'rgba(180,200,240,0.04)';
  ctx.fillRect(4, 4, 472, 252);
}

// ===== DOORWAYS =====
function drawDoorways(ctx: CanvasRenderingContext2D) {
  const wallFace = '#D4C4A8';
  for (const door of DOORWAYS) {
    // Clear wall section
    ctx.fillStyle = wallFace;
    ctx.fillRect(door.x, door.y, door.w, door.h + 4);
    // Door frame sides
    ctx.fillStyle = '#B89E82';
    ctx.fillRect(door.x - 2, door.y, 4, door.h + 4);
    ctx.fillRect(door.x + door.w - 2, door.y, 4, door.h + 4);
    // Door opening  (warm dark)
    ctx.fillStyle = '#C8B496';
    ctx.fillRect(door.x + 2, door.y + 2, door.w - 4, door.h);
    // Threshold line
    ctx.fillStyle = '#A89070';
    ctx.fillRect(door.x, door.y + door.h + 2, door.w, 2);
  }
}

// ===== BASEBOARDS =====
function drawBaseboards(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#C4A882';
  ctx.fillRect(0, 256, W, 3);
  ctx.fillRect(0, 516, W, 3);
  ctx.fillRect(0, H - 3, 240, 3);
  ctx.fillRect(240, H - 3, 340, 3);
  ctx.fillRect(580, H - 3, 380, 3);
}

// ===== ROOM LABELS =====
function drawRoomLabel(ctx: CanvasRenderingContext2D, room: RoomDef) {
  ctx.fillStyle = 'rgba(120,100,80,0.5)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${room.emoji} ${room.label}`, room.x + 8, room.y + 16);
}

// ===== WEATHER WINDOWS =====
function drawWeatherWindows(ctx: CanvasRenderingContext2D, frame: number) {
  const now = new Date();
  const aestHour = (now.getUTCHours() + 10) % 24;
  const isDay = aestHour >= 6 && aestHour < 18;

  const windows = [
    { x: 30, y: 12, w: 58, h: 42 },
    { x: 130, y: 12, w: 58, h: 42 },
    { x: 360, y: 12, w: 58, h: 42 },
  ];

  for (const win of windows) {
    // Frame (warm wood)
    ctx.fillStyle = '#C4A882';
    ctx.fillRect(win.x - 3, win.y - 3, win.w + 6, win.h + 6);
    ctx.fillStyle = '#A88C6A';
    ctx.fillRect(win.x - 2, win.y - 2, win.w + 4, win.h + 4);

    if (isDay) {
      const skyGrad = ctx.createLinearGradient(win.x, win.y, win.x, win.y + win.h);
      skyGrad.addColorStop(0, '#6AABDD');
      skyGrad.addColorStop(1, '#88C4EE');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(win.x, win.y, win.w, win.h);

      for (let i = 0; i < 3; i++) {
        const cx = ((frame * 0.18 + i * 65) % (win.w + 40)) + win.x - 20;
        const cy = win.y + 10 + i * 8;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + 8, cy - 2, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const skyGrad = ctx.createLinearGradient(win.x, win.y, win.x, win.y + win.h);
      skyGrad.addColorStop(0, '#0A1020');
      skyGrad.addColorStop(1, '#1A2844');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(win.x, win.y, win.w, win.h);

      const stars = [[8,6],[25,12],[42,8],[15,24],[38,18],[48,28],[12,32],[32,6]];
      for (const [sx, sy] of stars) {
        const twinkle = Math.sin(frame * 0.05 + sx * 0.3 + sy * 0.2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0.1, 0.3 + twinkle * 0.4)})`;
        ctx.fillRect(win.x + sx, win.y + sy, 1, 1);
      }
      ctx.fillStyle = '#FFFFCC';
      ctx.beginPath();
      ctx.arc(win.x + win.w - 10, win.y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Window dividers
    ctx.fillStyle = 'rgba(160,140,110,0.7)';
    ctx.fillRect(win.x + win.w / 2 - 1, win.y, 2, win.h);
    ctx.fillRect(win.x, win.y + win.h / 2 - 1, win.w, 2);

    // Light spill on floor
    ctx.fillStyle = isDay ? 'rgba(180,220,255,0.04)' : 'rgba(60,80,140,0.03)';
    ctx.fillRect(win.x - 12, win.y + win.h + 4, win.w + 24, 45);
  }
}

// ===== WALL DECORATIONS =====
function drawWallDecorations(ctx: CanvasRenderingContext2D, frame: number) {
  // Agency sign
  ctx.fillStyle = '#C4A882';
  ctx.fillRect(435, 263, 90, 22);
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(437, 265, 86, 18);
  ctx.fillStyle = '#EDD9C0';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚡ AGENCY HQ', 480, 278);

  // Sticky notes
  const stickyColors = ['#fbbf24', '#22c55e', '#ec4899', '#3b82f6'];
  for (let i = 0; i < 4; i++) {
    const sx = 560 + i * 22;
    ctx.fillStyle = stickyColors[i] + '55';
    ctx.fillRect(sx, 268, 16, 16);
    ctx.strokeStyle = stickyColors[i] + '88';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx, 268, 16, 16);
    ctx.fillStyle = stickyColors[i] + '33';
    ctx.fillRect(sx + 2, 272, 8, 1);
    ctx.fillRect(sx + 2, 275, 10, 1);
    ctx.fillRect(sx + 2, 278, 6, 1);
  }

  // Water cooler (iso box style)
  drawIsoBox(ctx, 38, 370, 20, 10, 24, '#D4E8F0', '#9ABBC8', '#B0CCD8', 'rgba(0,0,0,0.15)');
  // Water jug on top
  ctx.fillStyle = '#4488CC88';
  ctx.beginPath();
  ctx.ellipse(38, 360, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Steam from coffee machine area
  if (frame % 60 < 30) {
    ctx.fillStyle = 'rgba(220,210,200,0.12)';
    ctx.beginPath();
    ctx.arc(38, 358, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== MEETING ROOM =====
function drawMeetingRoom(ctx: CanvasRenderingContext2D, frame: number) {
  // Isometric conference table
  const tx = 210, ty = 128;
  // Table top (oval-ish using iso box wide and shallow)
  ctx.fillStyle = '#C4956A';
  ctx.beginPath();
  ctx.ellipse(tx, ty, 108, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#B8895E';
  ctx.beginPath();
  ctx.ellipse(tx, ty, 104, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  // Table top highlight
  ctx.fillStyle = 'rgba(255,235,200,0.15)';
  ctx.beginPath();
  ctx.ellipse(tx - 15, ty - 10, 50, 18, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Table side (3D depth)
  ctx.fillStyle = '#8B6914';
  ctx.beginPath();
  ctx.ellipse(tx, ty + 12, 108, 44, 0, 0, Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(tx, ty + 12, 104, 40, 0, 0, Math.PI);
  ctx.fill();
  // Shadow
  drawShadow(ctx, tx, ty + 30, 95, 14);

  // Chairs around table
  const chairPositions = [
    { x: 100, y: 110, color: '#B8A090' },
    { x: 180, y: 80, color: '#B8A090' },
    { x: 260, y: 80, color: '#B8A090' },
    { x: 340, y: 110, color: '#B8A090' },
    { x: 110, y: 160, color: '#B8A090' },
    { x: 190, y: 185, color: '#B8A090' },
    { x: 270, y: 185, color: '#B8A090' },
    { x: 350, y: 160, color: '#B8A090' },
  ];
  for (const c of chairPositions) {
    drawIsoBox(ctx, c.x, c.y, 18, 9, 8, lightenColor(c.color, 0.15), darkenColor(c.color, 0.15), c.color, 'rgba(0,0,0,0.12)');
  }

  // Whiteboard (iso box flat against wall)
  drawIsoBox(ctx, 60, 42, 100, 10, 52, '#F4F0E8', '#D8D0C0', '#E4DDD0', 'rgba(0,0,0,0.1)');
  // Board content
  ctx.fillStyle = '#8B7355';
  ctx.font = '7px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Sprint Goals:', 22, 25);
  ctx.fillStyle = '#3B82F6';
  ctx.fillText('• Isometric UI ✓', 22, 36);
  ctx.fillStyle = '#22C55E';
  ctx.fillText('• Live Mode', 22, 47);
  ctx.fillStyle = '#EF4444';
  ctx.fillText('• Deploy', 22, 58);

  // Projector screen glow (animate)
  const projGlow = (Math.sin(frame * 0.02) + 1) / 2;
  ctx.fillStyle = `rgba(200,220,255,${0.03 + projGlow * 0.04})`;
  ctx.fillRect(0, 0, 480, 260);
}

// ===== SERVER ROOM =====
function drawServerRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const baseX = 530;

  for (let i = 0; i < 3; i++) {
    const rx = baseX + i * 120;
    const ry = 50;

    // Server rack as iso box
    drawIsoBox(ctx, rx + 20, ry + 10, 40, 20, 160, '#3A3A4E', '#22222E', '#2E2E3E', '#111118');

    // Unit LEDs
    for (let j = 0; j < 6; j++) {
      const uy = ry + 30 + j * 24;
      const pulse = (Math.sin(frame * 0.03 + i * 1.5 + j * 0.8) + 1) / 2;
      const g = Math.floor(100 + pulse * 155);
      ctx.fillStyle = `rgb(0,${g},0)`;
      ctx.beginPath();
      ctx.arc(rx + 36, uy, 2, 0, Math.PI * 2);
      ctx.fill();

      const isAlert = Math.sin(frame * 0.02 + i * 2.1) > 0.92;
      const bluePulse = (Math.sin(frame * 0.04 + i + j * 0.5) + 1) / 2;
      ctx.fillStyle = isAlert ? '#ef4444' : `rgba(59,130,246,${0.4 + bluePulse * 0.6})`;
      ctx.beginPath();
      ctx.arc(rx + 36, uy + 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    drawShadow(ctx, rx + 20, ry + 175, 22, 5);
  }

  // Temperature display
  ctx.fillStyle = '#111118';
  ctx.fillRect(900, 40, 46, 22);
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 1;
  ctx.strokeRect(900, 40, 46, 22);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('22°C', 923, 55);

  // Cables
  ctx.strokeStyle = '#4a4a6e55';
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(baseX + i * 120 + 20, 220);
    ctx.bezierCurveTo(baseX + i * 120 + 30, 240, baseX + (i + 1) * 120 + 10, 240, baseX + (i + 1) * 120 + 20, 220);
    ctx.stroke();
  }
}

// ===== ISO DESK =====
function drawIsoDesk(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  // Desk box
  const deskTop = '#C4956A';
  const deskLeft = '#8B6914';
  const deskRight = '#A07830';
  drawIsoBox(ctx, x, y + 18, 52, 26, 18, deskTop, deskLeft, deskRight, 'rgba(0,0,0,0.18)');

  // Monitor
  const monContent = MONITOR_CONTENT[agent.desk] || 'default';
  drawIsoMonitor(ctx, x - 6, y - 4, agent.color, frame, monContent);

  // Chair behind desk
  drawIsoBox(ctx, x, y + 46, 20, 10, 10, lightenColor(agent.color, 0.1), darkenColor(agent.color, 0.2), agent.color, 'rgba(0,0,0,0.12)');
}

// ===== ISO MONITOR =====
function drawIsoMonitor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, frame: number, content: string) {
  // Monitor box
  drawIsoBox(ctx, x, y, 22, 11, 18, '#2A2A3E', '#1A1A28', '#222232', 'rgba(0,0,0,0.3)');
  // Screen (on top face)
  const scrX = x - 8, scrY = y - 8;
  const scrW = 16, scrH = 10;
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(scrX, scrY, scrW, scrH);
  drawMonitorContent(ctx, scrX, scrY, scrW, scrH, color, frame, content);
  // Stand
  drawIsoBox(ctx, x, y + 18, 8, 4, 5, '#333340', '#222228', '#282830');
}

function drawMonitorContent(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, frame: number, content: string) {
  switch (content) {
    case 'green_code': {
      ctx.fillStyle = '#22c55e88';
      const scroll = Math.floor(frame * 0.4) % h;
      for (let l = 0; l < 4; l++) {
        const lw = 2 + ((l + scroll) % 4) * 2;
        const ly = y + 1 + l * 2.2 - (scroll % 2) * 0.3;
        if (ly > y && ly < y + h) ctx.fillRect(x + 1, ly, lw, 1);
      }
      if (frame % 30 < 15) {
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(x + 1 + (frame * 0.15 % 8), y + h - 2, 2, 1);
      }
      break;
    }
    case 'candle_chart': {
      for (let i = 0; i < 5; i++) {
        const bh = 1 + Math.abs(Math.sin(frame * 0.015 + i * 1.3)) * (h - 3);
        const isGreen = Math.sin(frame * 0.02 + i * 1.7) > 0;
        ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
        ctx.fillRect(x + 1 + i * 2.5, y + h - 1 - bh, 1.5, bh);
      }
      break;
    }
    case 'dashboard': {
      ctx.fillStyle = color + '55';
      for (let i = 0; i < 3; i++) {
        const bh = 1 + Math.abs(Math.sin(frame * 0.02 + i)) * (h / 2);
        ctx.fillRect(x + 1 + i * 4, y + h - 1 - bh, 2.5, bh);
      }
      ctx.strokeStyle = '#22c55e55';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 3);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(x + 1 + i * 3, y + 3 - Math.sin(frame * 0.03 + i) * 2);
      }
      ctx.stroke();
      break;
    }
    case 'shield_pulse': {
      const pulse = (Math.sin(frame * 0.06) + 1) / 2;
      ctx.fillStyle = `rgba(239,68,68,${0.3 + pulse * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 1);
      ctx.lineTo(x + w - 1, y + 3);
      ctx.lineTo(x + w - 2, y + h - 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x + 2, y + h - 2);
      ctx.lineTo(x + 1, y + 3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = color + '44';
      for (let l = 0; l < 3; l++) {
        ctx.fillRect(x + 1, y + 1 + l * 3, 5 + (l % 2) * 3, 1);
      }
    }
  }
}

// ===== MAIN OFFICE DESKS =====
function drawMainOfficeDesks(ctx: CanvasRenderingContext2D, frame: number, agents: AgentState[]) {
  // Plants in corners
  drawIsoPlant(ctx, 55, 296, frame, 0);
  drawIsoPlant(ctx, 910, 296, frame, 100);
  drawIsoPlant(ctx, 55, 458, frame, 200);
  drawIsoPlant(ctx, 910, 458, frame, 300);

  // Sort desks by row (back row first, front row second for proper z-ordering)
  const row0 = agents.filter(a => {
    const desk = DESK_LAYOUT[a.desk];
    return desk && desk.row === 0;
  });
  const row1 = agents.filter(a => {
    const desk = DESK_LAYOUT[a.desk];
    return desk && desk.row === 1;
  });

  for (const agent of row0) {
    const desk = DESK_LAYOUT[agent.desk];
    if (desk) drawIsoDesk(ctx, desk.x, desk.y, agent, frame);
  }
  for (const agent of row1) {
    const desk = DESK_LAYOUT[agent.desk];
    if (desk) drawIsoDesk(ctx, desk.x, desk.y, agent, frame);
  }
}

// ===== KITCHEN =====
function drawKitchen(ctx: CanvasRenderingContext2D, frame: number) {
  const kx = 20, ky = 545;

  // Counter (long iso box)
  drawIsoBox(ctx, kx + 105, ky + 5, 200, 18, 14, '#C4956A', '#8B6914', '#A07830', 'rgba(0,0,0,0.15)');

  // Coffee machine on counter
  drawIsoBox(ctx, kx + 35, ky - 10, 28, 14, 22, '#5A5A6E', '#3A3A4E', '#484858', 'rgba(0,0,0,0.2)');
  // Cup
  ctx.fillStyle = '#F5F5F0';
  ctx.beginPath();
  ctx.ellipse(kx + 48, ky - 12, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8B6914';
  ctx.beginPath();
  ctx.ellipse(kx + 48, ky - 12, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Coffee steam
  for (let i = 0; i < 3; i++) {
    const sy = ky - 20 - i * 5 - Math.sin(frame * 0.06 + i) * 3;
    const sx = kx + 48 + Math.sin(frame * 0.04 + i * 1.8) * 3;
    ctx.fillStyle = `rgba(220,210,200,${0.3 - i * 0.08})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fridge (tall iso box)
  drawIsoBox(ctx, kx + 190, ky - 18, 36, 18, 58, '#E8E8E4', '#C4C4C0', '#D8D8D4', 'rgba(0,0,0,0.12)');
  // Fridge handle
  ctx.fillStyle = '#A0A0A0';
  ctx.fillRect(kx + 175, ky - 8, 2, 14);

  // Microwave (small iso box)
  drawIsoBox(ctx, kx + 100, ky - 6, 24, 12, 14, '#6A6A7A', '#4A4A5A', '#585868', 'rgba(0,0,0,0.2)');

  // Bar stools
  drawIsoBox(ctx, kx + 55, ky + 40, 16, 8, 8, '#E8D5BC', '#C4A882', '#D4B894', 'rgba(0,0,0,0.12)');
  drawIsoBox(ctx, kx + 105, ky + 42, 16, 8, 8, '#E8D5BC', '#C4A882', '#D4B894', 'rgba(0,0,0,0.12)');
}

// ===== GAME ROOM =====
function drawGameRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const gx = 260, gy = 540;

  // Ping pong table (iso surface)
  ctx.fillStyle = '#2E7A4A';
  ctx.beginPath();
  ctx.moveTo(gx + 80, gy + 25);
  ctx.lineTo(gx + 170, gy + 55);
  ctx.lineTo(gx + 140, gy + 95);
  ctx.lineTo(gx + 50, gy + 65);
  ctx.closePath();
  ctx.fill();
  // Table net
  ctx.strokeStyle = '#FFFFFF88';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gx + 95, gy + 55);
  ctx.lineTo(gx + 125, gy + 60);
  ctx.stroke();
  // Table legs
  ctx.strokeStyle = '#4A4A4A';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gx + 80, gy + 25); ctx.lineTo(gx + 80, gy + 35);
  ctx.moveTo(gx + 170, gy + 55); ctx.lineTo(gx + 170, gy + 65);
  ctx.moveTo(gx + 140, gy + 95); ctx.lineTo(gx + 140, gy + 105);
  ctx.moveTo(gx + 50, gy + 65); ctx.lineTo(gx + 50, gy + 75);
  ctx.stroke();
  drawShadow(ctx, gx + 108, gy + 80, 50, 8);

  // Arcade cabinet (iso box)
  drawIsoBox(ctx, gx + 215, gy + 15, 36, 18, 58, '#1A1A3E', '#0E0E28', '#141432', 'rgba(0,0,0,0.3)');
  // Arcade screen
  const glowColor = `hsl(${(frame * 2) % 360}, 70%, 50%)`;
  ctx.fillStyle = glowColor + '55';
  ctx.fillRect(gx + 200, gy + 2, 26, 18);
  ctx.fillStyle = '#333';
  ctx.fillRect(gx + 209, gy + 38, 6, 6);
  drawShadow(ctx, gx + 215, gy + 80, 20, 5);

  // Beanbags
  const beanbags = [
    { x: gx + 290, y: gy + 55, color: '#5A3080' },
    { x: gx + 320, y: gy + 80, color: '#204070' },
    { x: gx + 275, y: gy + 95, color: '#205040' },
  ];
  for (const bb of beanbags) {
    drawShadow(ctx, bb.x, bb.y + 10, 18, 5);
    ctx.fillStyle = bb.color;
    ctx.beginPath();
    ctx.ellipse(bb.x, bb.y, 18, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lightenColor(bb.color, 0.3) + '44';
    ctx.beginPath();
    ctx.ellipse(bb.x - 3, bb.y - 4, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== REST ROOM =====
function drawRestRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const rx = 580, ry = 520;

  // Dim ambient
  ctx.fillStyle = 'rgba(10,5,20,0.2)';
  ctx.fillRect(rx, ry, 380, 200);

  // Moon & stars decal on wall
  ctx.fillStyle = 'rgba(255,255,180,0.2)';
  ctx.beginPath();
  ctx.arc(rx + 330, ry + 28, 14, 0, Math.PI * 2);
  ctx.fill();
  const restStars = [[40,18],[80,12],[120,22],[160,10],[200,20],[250,16],[100,32],[180,36],[60,38],[280,24]];
  for (const [sx, sy] of restStars) {
    const twinkle = Math.sin(frame * 0.04 + sx * 0.2 + sy * 0.3);
    ctx.fillStyle = `rgba(200,200,255,${Math.max(0.05, 0.12 + twinkle * 0.1)})`;
    ctx.fillRect(rx + sx, ry + sy, 1, 1);
  }

  // Beds (iso flat boxes)
  const bedColors = ['#3A2858', '#2A3858', '#2A3A48', '#3A2A40'];
  const bedPositions = [
    { x: rx + 50, y: ry + 68 },
    { x: rx + 135, y: ry + 63 },
    { x: rx + 220, y: ry + 68 },
    { x: rx + 305, y: ry + 63 },
    { x: rx + 70, y: ry + 130 },
    { x: rx + 155, y: ry + 135 },
    { x: rx + 240, y: ry + 130 },
    { x: rx + 330, y: ry + 135 },
    { x: rx + 95, y: ry + 175 },
    { x: rx + 190, y: ry + 178 },
    { x: rx + 285, y: ry + 175 },
  ];
  for (let i = 0; i < bedPositions.length; i++) {
    const pos = bedPositions[i];
    const col = bedColors[i % bedColors.length];
    drawIsoBox(ctx, pos.x, pos.y, 50, 14, 8, lightenColor(col, 0.1), darkenColor(col, 0.1), col, 'rgba(0,0,0,0.15)');
    // Pillow
    ctx.fillStyle = lightenColor(col, 0.3) + '66';
    ctx.beginPath();
    ctx.ellipse(pos.x - 14, pos.y - 4, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Night light glow
  const nlPulse = (Math.sin(frame * 0.03) + 1) / 2;
  const nlGrad = ctx.createRadialGradient(rx + 355, ry + 175, 2, rx + 355, ry + 175, 35);
  nlGrad.addColorStop(0, `rgba(147,51,234,${0.12 + nlPulse * 0.1})`);
  nlGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = nlGrad;
  ctx.fillRect(rx + 320, ry + 140, 70, 70);
  // Night light device
  drawIsoBox(ctx, rx + 355, ry + 176, 8, 4, 6, '#3A2A50', '#2A1A40', '#302040');
}

// ===== ISO PLANT =====
function drawIsoPlant(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, offset: number) {
  const sway = Math.sin(frame * 0.012 + offset * 0.01) * 1.2;
  drawShadow(ctx, x, y + 18, 10, 3);
  // Pot (iso box)
  drawIsoBox(ctx, x, y + 10, 18, 9, 12, '#C4845A', '#8B5A30', '#A86E42', 'rgba(0,0,0,0.15)');
  // Soil
  ctx.fillStyle = '#5A3A20';
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stem
  ctx.fillStyle = '#166534';
  ctx.fillRect(x - 1, y - 10, 2, 14);
  // Leaves
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.ellipse(x + sway - 4, y - 6, 9, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + sway + 4, y - 8, 9, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.ellipse(x + sway, y - 12, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== CLOCK =====
function drawClock(ctx: CanvasRenderingContext2D) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Sydney' });
  ctx.fillStyle = '#C4A882';
  ctx.fillRect(378, 263, 52, 18);
  ctx.fillStyle = '#2A1A0A';
  ctx.fillRect(380, 265, 48, 14);
  ctx.fillStyle = '#EDD9C0';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(timeStr, 404, 276);
}

// ===== DAY/NIGHT OVERLAY =====
function drawDayNightOverlay(ctx: CanvasRenderingContext2D) {
  const now = new Date();
  const aestHour = (now.getUTCHours() + 10) % 24;

  if (aestHour >= 22 || aestHour < 6) {
    ctx.fillStyle = 'rgba(0,0,20,0.22)';
    ctx.fillRect(0, 0, W, H);
    // Warm lamp glow spots
    const lamps = [{ x: 120, y: 320 }, { x: 400, y: 320 }, { x: 680, y: 320 }];
    for (const lamp of lamps) {
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 5, lamp.x, lamp.y, 70);
      grad.addColorStop(0, 'rgba(255,200,100,0.10)');
      grad.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lamp.x - 70, lamp.y - 70, 140, 140);
    }
  } else if (aestHour >= 18 || aestHour < 7) {
    ctx.fillStyle = 'rgba(0,0,20,0.08)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ===== AMBIENT =====
function drawAmbient(ctx: CanvasRenderingContext2D, frame: number) {
  if (frame % 180 < 90) {
    ctx.fillStyle = 'rgba(180,160,120,0.012)';
    ctx.fillRect(2, 2, 476, 256);
  }
}

// ===== MINI-MAP =====
function drawMiniMap(ctx: CanvasRenderingContext2D, agents: AgentState[], animMap: Map<string, AnimAgent>) {
  const mx = 10, my = H - 100, mw = 120, mh = 90;
  const scaleX = mw / W;
  const scaleY = mh / H;

  ctx.fillStyle = 'rgba(10,10,20,0.75)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#C4A882';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mw, mh);

  ctx.strokeStyle = '#C4A88244';
  ctx.lineWidth = 0.5;
  for (const room of ROOMS) {
    ctx.strokeRect(
      mx + room.x * scaleX,
      my + room.y * scaleY,
      room.w * scaleX,
      room.h * scaleY,
    );
  }

  for (const agent of agents) {
    const anim = animMap.get(agent.id);
    if (!anim) continue;
    ctx.fillStyle = agent.color;
    ctx.beginPath();
    ctx.arc(mx + anim.x * scaleX, my + anim.y * scaleY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== AGENT DRAWING (CHIBI ISO STYLE) =====

function drawAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, anim: AnimAgent, frame: number) {
  const { state } = anim;
  const f = frame + anim.idleOffset;

  if (state === 'sleeping') { drawSleepingAgent(ctx, x, y, agent, f); return; }
  if (state === 'walking')  { drawWalkingAgent(ctx, x, y, agent, anim, f); return; }
  if (state === 'coffee')   { drawCoffeeAgent(ctx, x, y, agent, f); return; }
  if (state === 'meeting')  { drawMeetingAgent(ctx, x, y, agent, f); return; }
  if (state === 'sitting')  { drawSittingAgent(ctx, x, y, agent, f); return; }
  if (state === 'gaming')   { drawGamingAgent(ctx, x, y, agent, f); return; }
  drawStandingAgent(ctx, x, y, agent, f);
}

// Chibi body: small isometric box in agent color
function drawChibiBody(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, bobY: number) {
  const tw = 18, th = 10, bh = 14;
  const cy = y + bobY;
  drawIsoBox(
    ctx, x, cy, tw, th, bh,
    lightenColor(agent.color, 0.18),
    darkenColor(agent.color, 0.18),
    agent.color,
    'rgba(0,0,0,0.2)'
  );
}

// Chibi head: round, skin tone, colored hair
function drawChibiHead(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number, bobY: number) {
  const headX = x;
  const headY = y - 16 + bobY;

  // Head
  ctx.fillStyle = '#FDBCB4';
  ctx.beginPath();
  ctx.arc(headX, headY, 8, 0, Math.PI * 2);
  ctx.fill();

  // Cheeks
  ctx.fillStyle = 'rgba(255,160,160,0.3)';
  ctx.beginPath();
  ctx.ellipse(headX - 5, headY + 2, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headX + 5, headY + 2, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair (top arc in agent color)
  ctx.fillStyle = darkenColor(agent.color, 0.3);
  ctx.beginPath();
  ctx.arc(headX, headY - 1, 8, Math.PI * 0.9, Math.PI * 2.1);
  ctx.lineTo(headX, headY - 1);
  ctx.closePath();
  ctx.fill();

  // Hair tuft (unique per agent ID for variety)
  const tCode = agent.id.charCodeAt(0) % 3;
  if (tCode === 0) {
    ctx.beginPath();
    ctx.ellipse(headX, headY - 7, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (tCode === 1) {
    ctx.beginPath();
    ctx.ellipse(headX + 5, headY - 6, 3, 2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(headX - 4, headY - 6, 4, 2, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes
  const blink = Math.floor(frame) % 200 < 5;
  ctx.fillStyle = '#333';
  if (!blink) {
    ctx.beginPath(); ctx.arc(headX - 3, headY + 1, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(headX + 3, headY + 1, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(headX - 3.5, headY - 0.5, 1, 1);
    ctx.fillRect(headX + 2.5, headY - 0.5, 1, 1);
  } else {
    ctx.fillRect(headX - 4, headY + 1, 3, 1);
    ctx.fillRect(headX + 2, headY + 1, 3, 1);
  }
}

function drawSittingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const bob = agent.status === 'active'
    ? Math.sin(frame * 0.08) * 1.5
    : Math.sin(frame * 0.02) * 0.5;
  const dy = y - 10;

  drawShadow(ctx, x, dy + 24, 12, 4);
  drawChibiBody(ctx, x, dy, agent, bob);
  drawChibiHead(ctx, x, dy, agent, frame, bob);

  drawStatusDot(ctx, x + 11, dy - 22 + bob, agent.status, frame);
  drawAgentName(ctx, x, dy + 30, agent.name, agent.status);

  if (agent.status === 'active' && agent.currentTask) {
    drawSpeechBubble(ctx, x, dy - 32 + bob, agent.currentTask.substring(0, 26));
  }
}

function drawStandingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const bob = Math.sin(frame * 0.025) * 0.6;
  const dy = y - 5;

  drawShadow(ctx, x, dy + 26, 11, 4);
  drawChibiBody(ctx, x, dy, agent, bob);
  drawChibiHead(ctx, x, dy, agent, frame, bob);

  drawStatusDot(ctx, x + 11, dy - 22 + bob, agent.status, frame);
  drawAgentName(ctx, x, dy + 32, agent.name, agent.status);
}

function drawWalkingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, anim: AnimAgent, frame: number) {
  const walkPhase = (anim.walkFrame % 30) / 30;
  const bob = Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 2;
  const dy = y - 5;

  drawShadow(ctx, x, dy + 26, 11, 4);
  drawChibiBody(ctx, x, dy, agent, -bob);
  drawChibiHead(ctx, x, dy, agent, frame, -bob);

  // Walking legs — two small iso boxes
  const legOff = Math.sin(walkPhase * Math.PI * 2) * 5;
  ctx.fillStyle = darkenColor(agent.color, 0.4);
  ctx.beginPath(); ctx.ellipse(x - 4, dy + 28 - legOff / 2, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 4, dy + 28 + legOff / 2, 3, 2, 0, 0, Math.PI * 2); ctx.fill();

  drawAgentName(ctx, x, dy + 36, agent.name, agent.status);
}

function drawSleepingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const breathe = Math.sin(frame * 0.03) * 0.6;
  const dy = y - 5;

  drawShadow(ctx, x, dy + 12, 18, 4);

  // Body horizontal (iso flat box)
  drawIsoBox(
    ctx, x, dy + breathe, 28, 12, 8,
    lightenColor(agent.color, 0.18),
    darkenColor(agent.color, 0.18),
    agent.color,
    'rgba(0,0,0,0.15)'
  );

  // Head to the side
  ctx.fillStyle = '#FDBCB4';
  ctx.beginPath();
  ctx.arc(x - 16, dy - 2 + breathe, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = darkenColor(agent.color, 0.3);
  ctx.beginPath();
  ctx.arc(x - 16, dy - 3 + breathe, 7, Math.PI * 0.9, Math.PI * 2.1);
  ctx.lineTo(x - 16, dy - 3 + breathe);
  ctx.closePath();
  ctx.fill();

  // Eyes (closed)
  ctx.fillStyle = '#555';
  ctx.fillRect(x - 19, dy - 2 + breathe, 3, 1);
  ctx.fillRect(x - 14, dy - 2 + breathe, 3, 1);

  // Blanket
  ctx.fillStyle = 'rgba(60,40,100,0.4)';
  ctx.beginPath();
  ctx.moveTo(x - 10, dy + 4 + breathe);
  ctx.lineTo(x + 16, dy + 2 + breathe);
  ctx.lineTo(x + 14, dy + 14 + breathe);
  ctx.lineTo(x - 12, dy + 16 + breathe);
  ctx.closePath();
  ctx.fill();

  // ZZZ
  const zFloat = Math.sin(frame * 0.04) * 3;
  ctx.fillStyle = '#9ca3af66';
  ctx.font = '7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('z', x - 8, dy - 14 + zFloat);
  ctx.font = '9px sans-serif';
  ctx.fillText('z', x - 3, dy - 22 + zFloat * 0.7);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#9ca3af44';
  ctx.fillText('Z', x + 3, dy - 30 + zFloat * 0.5);

  ctx.fillStyle = '#6B7280';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, x, dy + 26);
}

function drawCoffeeAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const bob = Math.sin(frame * 0.025) * 0.4;
  const dy = y - 5;

  drawShadow(ctx, x, dy + 26, 11, 4);
  drawChibiBody(ctx, x, dy, agent, bob);
  drawChibiHead(ctx, x, dy, agent, frame, bob);

  // Coffee cup (small iso box)
  drawIsoBox(ctx, x + 14, dy + 12 + bob, 10, 5, 7, '#F5F5F0', '#D0D0C8', '#E0E0D8');
  ctx.fillStyle = '#8B6914';
  ctx.beginPath();
  ctx.ellipse(x + 14, dy + 9 + bob, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Steam from cup
  for (let i = 0; i < 2; i++) {
    const sy = dy + 6 - i * 4 + bob - Math.sin(frame * 0.05 + i) * 2;
    ctx.fillStyle = `rgba(200,200,220,${0.25 - i * 0.08})`;
    ctx.beginPath();
    ctx.arc(x + 14 + Math.sin(frame * 0.04 + i) * 2, sy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSpeechBubble(ctx, x, dy - 32 + bob, '☕ break');
  drawStatusDot(ctx, x + 11, dy - 22 + bob, agent.status, frame);
  drawAgentName(ctx, x, dy + 32, agent.name, agent.status);
}

function drawMeetingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const bob = Math.sin(frame * 0.035) * 0.4;
  const gesturing = Math.sin(frame * 0.06 + x * 0.1) > 0.55;
  const dy = y - 5;

  drawShadow(ctx, x, dy + 26, 11, 4);
  drawChibiBody(ctx, x, dy, agent, bob);
  drawChibiHead(ctx, x, dy, agent, frame, bob);

  // Raised arm when gesturing
  if (gesturing) {
    ctx.fillStyle = agent.color;
    ctx.beginPath();
    ctx.ellipse(x - 12, dy - 4 + bob, 4, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Hand
    ctx.fillStyle = '#FDBCB4';
    ctx.beginPath();
    ctx.arc(x - 14, dy - 10 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStatusDot(ctx, x + 11, dy - 22 + bob, agent.status, frame);
  drawAgentName(ctx, x, dy + 32, agent.name, agent.status);
}

function drawGamingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const lean = Math.sin(frame * 0.04) * 1.5;
  const dy = y - 5;

  drawShadow(ctx, x, dy + 26, 11, 4);
  drawChibiBody(ctx, x + lean, dy, agent, 0);
  drawChibiHead(ctx, x + lean, dy, agent, frame, 0);

  // Controller in hands
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.ellipse(x + 14, dy + 16, 6, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.arc(x + 15, dy + 14, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3B82F6';
  ctx.beginPath();
  ctx.arc(x + 17, dy + 16, 1.5, 0, Math.PI * 2);
  ctx.fill();

  drawStatusDot(ctx, x + lean + 11, dy - 22, agent.status, frame);
  drawAgentName(ctx, x, dy + 32, agent.name, agent.status);
}

// ===== STATUS DOT =====
function drawStatusDot(ctx: CanvasRenderingContext2D, x: number, y: number, status: string, frame: number) {
  const color = status === 'active' ? '#22c55e' : status === 'idle' ? '#eab308' : '#4b5563';
  if (status === 'active') {
    const pulse = (Math.sin(frame * 0.06) + 1) / 2;
    ctx.fillStyle = `rgba(34,197,94,${0.1 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x - 1, y - 2, 2, 1);
}

// ===== SPEECH BUBBLE =====
function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  const maxW = 150;
  const textW = Math.min(text.length * 4.8 + 14, maxW);
  const bx = x - textW / 2;
  const by = y - 14;

  ctx.fillStyle = '#1a1a2eDD';
  ctx.strokeStyle = '#C4A88266';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, textW, 14, 4);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.fillStyle = '#1a1a2eDD';
  ctx.beginPath();
  ctx.moveTo(x - 3, by + 14);
  ctx.lineTo(x, by + 18);
  ctx.lineTo(x + 3, by + 14);
  ctx.fill();

  ctx.fillStyle = '#EDD9C0';
  ctx.font = '7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, by + 10);
}

// ===== AGENT NAME =====
function drawAgentName(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, status: string) {
  const w = name.length * 5.5 + 8;
  ctx.fillStyle = 'rgba(10,10,15,0.55)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 7, w, 10, 3);
  ctx.fill();
  ctx.fillStyle = status === 'offline' ? '#6B7280' : '#EDD9C0';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name, x, y);
}

// Keep AGENTS import used (suppress unused warning)
void AGENTS;
