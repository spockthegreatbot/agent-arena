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

  ctx.beginPath();
  ctx.moveTo(cx, cy - thh);
  ctx.lineTo(cx + twh, cy);
  ctx.lineTo(cx, cy + thh);
  ctx.lineTo(cx - twh, cy);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 0.8; ctx.stroke(); }

  ctx.beginPath();
  ctx.moveTo(cx - twh, cy);
  ctx.lineTo(cx, cy + thh);
  ctx.lineTo(cx, cy + thh + bh);
  ctx.lineTo(cx - twh, cy + bh);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 0.8; ctx.stroke(); }

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
  { id: 'meeting_room', label: 'THRONE ROOM',   emoji: '👑',  x: 0,   y: 0,   w: 480, h: 260, floorColor1: '#8B7355', floorColor2: '#7A6548', tileSize: 28 },
  { id: 'server_room',  label: 'THE ARMORY',   emoji: '⚔️',  x: 480, y: 0,   w: 480, h: 260, floorColor1: '#8B7355', floorColor2: '#7A6548', tileSize: 24 },
  { id: 'main_office',  label: 'GUILD HALL',   emoji: '🏰',  x: 0,   y: 260, w: 960, h: 260, floorColor1: '#8B7355', floorColor2: '#7A6548', tileSize: 32 },
  { id: 'kitchen',      label: 'THE TAVERN',   emoji: '🍺',  x: 0,   y: 520, w: 240, h: 200, floorColor1: '#8B7355', floorColor2: '#7A6548', tileSize: 26 },
  { id: 'game_room',    label: 'TRAINING',     emoji: '🗡️', x: 240, y: 520, w: 340, h: 200, floorColor1: '#8B7355', floorColor2: '#7A6548', tileSize: 30 },
  { id: 'rest_room',    label: 'DUNGEON CELLS', emoji: '🔒',  x: 580, y: 520, w: 380, h: 200, floorColor1: '#8B7355', floorColor2: '#7A6548', tileSize: 28 },
];

function getRoomDef(id: RoomId): RoomDef {
  return ROOMS.find(r => r.id === id) || ROOMS[2];
}

// ===== DESK POSITIONS (staggered) =====
const DESK_LAYOUT: Record<string, { x: number; y: number; row: number }> = {
  command:     { x: 80,  y: 310, row: 0 },
  dev:         { x: 220, y: 310, row: 0 },
  trading:     { x: 360, y: 310, row: 0 },
  research:    { x: 520, y: 310, row: 0 },
  design:      { x: 680, y: 310, row: 0 },
  security:    { x: 840, y: 310, row: 0 },
  content:     { x: 140, y: 420, row: 1 },
  strategy:    { x: 300, y: 420, row: 1 },
  engineering: { x: 460, y: 420, row: 1 },
  pm:          { x: 620, y: 420, row: 1 },
  finance:     { x: 780, y: 420, row: 1 },
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

// Pet wander spots per room
const PET_ROOM_SPOTS: Record<RoomId, { x: number; y: number }[]> = {
  main_office:  [{ x: 480, y: 380 }, { x: 300, y: 360 }, { x: 650, y: 395 }, { x: 150, y: 370 }, { x: 820, y: 365 }],
  meeting_room: [{ x: 180, y: 195 }, { x: 280, y: 205 }, { x: 380, y: 195 }],
  kitchen:      [{ x: 80,  y: 600 }, { x: 120, y: 640 }, { x: 180, y: 620 }],
  game_room:    [{ x: 340, y: 600 }, { x: 440, y: 625 }, { x: 510, y: 610 }],
  server_room:  [{ x: 600, y: 185 }, { x: 700, y: 195 }, { x: 820, y: 185 }],
  rest_room:    [{ x: 680, y: 625 }, { x: 780, y: 640 }, { x: 880, y: 625 }],
};

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

// ===== PET STATE =====
interface PetState {
  x: number; y: number;
  targetX: number; targetY: number;
  room: RoomId;
  wagFrame: number; // 0 or 1
  moving: boolean;
  footprints: { x: number; y: number; age: number }[];
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
  const petRef = useRef<PetState>({
    x: 120, y: 620, targetX: 120, targetY: 620,
    room: 'kitchen', wagFrame: 0, moving: false, footprints: [],
  });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; agent: string; emoji: string; color: string; message: string; time: number }[]>([]);
  const toastIdRef = useRef(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  useEffect(() => {
    if (activities.length > prevActivitiesRef.current && prevActivitiesRef.current > 0) {
      const newItems = activities.slice(prevActivitiesRef.current);
      for (const item of newItems) {
        const eventType = detectEventType(item.message);
        if (eventType) spawnEffect(item.agentId, eventType);
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

    ctx.fillStyle = '#1A1208';
    ctx.fillRect(0, 0, W, H);

    for (const room of ROOMS) drawRoomFloor(ctx, room);
    drawWeatherWindows(ctx, frame);
    drawWalls(ctx);
    drawDoorways(ctx);
    drawBaseboards(ctx);
    for (const room of ROOMS) drawRoomLabel(ctx, room);

    drawWarRoom(ctx, frame);
    drawTheVault(ctx, frame);
    drawTheFloor(ctx, frame, agents);
    drawThePit(ctx, frame);
    drawTheArcade(ctx, frame);
    drawSleepPods(ctx, frame);
    drawDungeonProps(ctx, frame);
    drawWallDecorations(ctx, frame);
    drawTorches(ctx, frame);
    drawDayNightOverlay(ctx);
    drawClock(ctx);

    // Agent footprints
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

    // ===== PET UPDATE =====
    const pet = petRef.current;

    // New target every ~45 seconds
    if (frame % 2700 === 1) {
      const activeAgents = agents.filter(a => a.status === 'active');
      if (Math.random() < 0.2 && activeAgents.length > 0) {
        const target = activeAgents[Math.floor(Math.random() * activeAgents.length)];
        const anim = agentAnimRef.current.get(target.id);
        if (anim) {
          pet.targetX = anim.x + 18;
          pet.targetY = anim.y + 8;
          pet.room = target.room;
        }
      } else {
        const roomIds = Object.keys(PET_ROOM_SPOTS) as RoomId[];
        const room = roomIds[Math.floor(Math.random() * roomIds.length)];
        const spots = PET_ROOM_SPOTS[room];
        const spot = spots[Math.floor(Math.random() * spots.length)];
        pet.targetX = spot.x + (Math.random() - 0.5) * 30;
        pet.targetY = spot.y + (Math.random() - 0.5) * 20;
        pet.room = room;
      }
    }

    // Move pet
    const pdx = pet.targetX - pet.x;
    const pdy = pet.targetY - pet.y;
    const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (pdist > 2) {
      pet.x += (pdx / pdist) * 0.8;
      pet.y += (pdy / pdist) * 0.8;
      pet.moving = true;
      if (frame % 15 === 0) {
        pet.footprints.push({ x: pet.x, y: pet.y, age: 0 });
      }
    } else {
      pet.moving = false;
    }

    if (frame % 20 === 0) pet.wagFrame = 1 - pet.wagFrame;

    pet.footprints = pet.footprints
      .map(fp => ({ ...fp, age: fp.age + 1 }))
      .filter(fp => fp.age < 60);

    // Draw pet footprints (tiny 4-dot pawprints)
    for (const fp of pet.footprints) {
      const alpha = (1 - fp.age / 60) * 0.35;
      ctx.fillStyle = `rgba(160,100,40,${alpha})`;
      ctx.beginPath(); ctx.arc(fp.x - 2, fp.y - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(fp.x + 2, fp.y - 1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(fp.x - 1, fp.y + 1.5, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(fp.x + 1, fp.y + 1.5, 1.2, 0, Math.PI * 2); ctx.fill();
    }

    // Draw pet before agents
    drawPixelDog(ctx, pet, frame);

    // ===== AGENTS =====
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

      // Agent shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(anim.x, anim.y + 22, 13, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Active agent glow halo
      if (agent.status === 'active') {
        const pulse = (Math.sin(frame * 0.06) + 1) / 2;
        ctx.fillStyle = agent.color + Math.floor((0.12 + pulse * 0.1) * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(anim.x, anim.y, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      // Idle sparkles when idle > 5min
      if (agent.status === 'idle' && agent.idleMinutes > 5 && frame % 8 === 0) {
        const sparkAngle = (frame * 0.15 + anim.idleOffset) % (Math.PI * 2);
        ctx.fillStyle = '#eab30888';
        ctx.beginPath();
        ctx.arc(
          anim.x + Math.cos(sparkAngle) * 16,
          anim.y + Math.sin(sparkAngle) * 10 - 8,
          1.5, 0, Math.PI * 2
        );
        ctx.fill();
        ctx.beginPath();
        ctx.arc(
          anim.x + Math.cos(sparkAngle + 2.1) * 14,
          anim.y + Math.sin(sparkAngle + 2.1) * 8 - 5,
          1, 0, Math.PI * 2
        );
        ctx.fill();
      }

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
    if (!isMobile) drawMiniMap(ctx, agents, animMap);

    // Heavy dungeon vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Floating dust motes
    for (let i = 0; i < 6; i++) {
      const dmx = W * 0.1 + i * (W / 6) + Math.sin(frame * 0.01 + i) * 30;
      const dmy = ((H * 0.9 - (frame * 0.18 + i * (H / 6))) % H + H) % H;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(dmx, dmy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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

// ===== DUNGEON PROPS =====
function drawDungeonProps(ctx: CanvasRenderingContext2D, frameCount: number) {
  // ---- THRONE ROOM (meeting_room) ----
  // Red carpet: thin iso parallelogram from door to throne
  ctx.save();
  ctx.fillStyle = '#8B0000';
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(195, 258);
  ctx.lineTo(255, 258);
  ctx.lineTo(255, 88);
  ctx.lineTo(195, 88);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Throne at x:240,y:80: base, seat, back
  drawIsoBox(ctx, 240, 92, 40, 20, 12, '#2A1F14', darkenColor('#2A1F14', 0.3), darkenColor('#2A1F14', 0.15));
  drawIsoBox(ctx, 240, 84, 30, 16, 8, '#5C3D1A', darkenColor('#5C3D1A', 0.25), darkenColor('#5C3D1A', 0.12));
  drawIsoBox(ctx, 240, 72, 20, 10, 30, '#8B6914', darkenColor('#8B6914', 0.2), darkenColor('#8B6914', 0.1));
  // Gold spikes on throne back
  for (let s = 0; s < 3; s++) {
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(228 + s * 7, 40);
    ctx.lineTo(232 + s * 7, 52);
    ctx.lineTo(224 + s * 7, 52);
    ctx.closePath();
    ctx.fill();
  }

  // Two stone columns
  drawIsoBox(ctx, 80, 60, 16, 8, 50, '#7D6B56', '#4A3D2E', '#6B5A47');
  drawIsoBox(ctx, 400, 60, 16, 8, 50, '#7D6B56', '#4A3D2E', '#6B5A47');

  // Purple banner on back wall
  ctx.fillStyle = '#9333ea';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(218, 8);
  ctx.lineTo(264, 8);
  ctx.lineTo(264, 50);
  ctx.lineTo(241, 62);
  ctx.lineTo(218, 50);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // ---- ARMORY (server_room) ----
  // 4 weapon racks
  const rackPositions = [[540, 60], [640, 50], [740, 60], [840, 50]] as [number, number][];
  for (const [rx, ry] of rackPositions) {
    drawIsoBox(ctx, rx, ry, 24, 12, 32, '#3D2B1F', darkenColor('#3D2B1F', 0.2), darkenColor('#3D2B1F', 0.1));
    // Crossed sword lines on front face
    ctx.strokeStyle = '#C0C0C0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx - 8, ry + 20);
    ctx.lineTo(rx + 2, ry + 42);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx + 2, ry + 20);
    ctx.lineTo(rx - 8, ry + 42);
    ctx.stroke();
  }

  // Animated rune circles
  for (const [rcx, rcy] of [[700, 150], [800, 140]] as [number, number][]) {
    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(frameCount * 0.03) * 0.3;
    ctx.strokeStyle = '#8B00FF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rcx, rcy, 20, 0, Math.PI * 2);
    ctx.stroke();
    // Inner rune lines
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(rcx + Math.cos(a) * 20, rcy + Math.sin(a) * 20);
      ctx.lineTo(rcx + Math.cos(a + Math.PI * 2 / 3) * 20, rcy + Math.sin(a + Math.PI * 2 / 3) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Ancient chest
  drawIsoBox(ctx, 900, 180, 20, 12, 12, '#8B5E3C', darkenColor('#8B5E3C', 0.2), darkenColor('#8B5E3C', 0.1));
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(906, 188, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // ---- GUILD HALL (main_office) ----
  // Stone pillars at corners
  for (const [px, py] of [[20, 270], [920, 270], [20, 498], [920, 498]] as [number, number][]) {
    drawIsoBox(ctx, px, py, 20, 10, 40, '#7D6B56', '#4A3D2E', '#6B5A47');
  }

  // Chandelier at (480,280): 8 flame dots in circle
  for (let cd = 0; cd < 8; cd++) {
    const ca = (cd / 8) * Math.PI * 2;
    const cfx = 480 + Math.cos(ca) * 20;
    const cfy = 285 + Math.sin(ca) * 8;
    const cpulse = 0.6 + Math.sin(frameCount * 0.06 + cd) * 0.4;
    ctx.fillStyle = `rgba(255,140,0,${cpulse})`;
    ctx.beginPath();
    ctx.arc(cfx, cfy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Chandelier chain
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(480, 265);
  ctx.lineTo(480, 278);
  ctx.stroke();

  // Notice board
  drawIsoBox(ctx, 880, 300, 40, 4, 30, '#C4A882', darkenColor('#C4A882', 0.15), darkenColor('#C4A882', 0.08));
  ctx.fillStyle = '#8B5E3C';
  ctx.fillRect(866, 298, 20, 1.5);
  ctx.fillRect(866, 302, 16, 1.5);
  ctx.fillRect(866, 306, 12, 1.5);

  // Quills on desks
  const deskPositions = [
    [80, 310], [220, 310], [360, 310], [520, 310], [680, 310], [840, 310],
    [140, 420], [300, 420], [460, 420], [620, 420], [780, 420],
  ];
  for (const [dx, dy] of deskPositions) {
    ctx.strokeStyle = '#F5F0E0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx + 5, dy - 8);
    ctx.lineTo(dx + 12, dy - 2);
    ctx.stroke();
  }

  // ---- TAVERN (kitchen) ----
  // Fireplace at (20,580)
  drawIsoBox(ctx, 20, 578, 60, 30, 20, '#2A1F14', darkenColor('#2A1F14', 0.25), darkenColor('#2A1F14', 0.12));
  // Fire inside
  const fp = (Math.sin(frameCount * 0.08) + 1) / 2;
  ctx.fillStyle = `rgba(255,140,0,${0.7 + fp * 0.3})`;
  ctx.beginPath();
  ctx.ellipse(20, 574, 10 * (1 + fp * 0.1), 8 * (1 + fp * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,220,0,${0.6 + fp * 0.3})`;
  ctx.beginPath();
  ctx.ellipse(20, 570, 6, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF88';
  ctx.beginPath();
  ctx.ellipse(20, 567, 2.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Fire glow
  const fireGrad = ctx.createRadialGradient(20, 578, 5, 20, 578, 70);
  fireGrad.addColorStop(0, 'rgba(255,100,0,0.18)');
  fireGrad.addColorStop(1, 'rgba(255,100,0,0)');
  ctx.fillStyle = fireGrad;
  ctx.fillRect(-30, 528, 120, 120);

  // 3 barrels
  for (const [bx, by] of [[160, 568], [188, 588], [216, 573]] as [number, number][]) {
    drawIsoBox(ctx, bx, by, 18, 10, 20, '#8B5E3C', darkenColor('#8B5E3C', 0.2), darkenColor('#8B5E3C', 0.1));
    // Oval top
    ctx.fillStyle = darkenColor('#8B5E3C', 0.15);
    ctx.beginPath();
    ctx.ellipse(bx, by - 2, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Barrel hoops
    ctx.strokeStyle = '#5C3D1A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(bx, by + 5, 9, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tavern table
  drawIsoBox(ctx, 120, 638, 60, 30, 8, '#C4956A', darkenColor('#C4956A', 0.2), darkenColor('#C4956A', 0.1));

  // ---- TRAINING GROUNDS (game_room) ----
  // Training dummy
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(310, 610);
  ctx.lineTo(310, 558);
  ctx.stroke();
  // Dummy head/torso
  drawIsoBox(ctx, 310, 574, 16, 10, 20, '#C8A050', darkenColor('#C8A050', 0.2), darkenColor('#C8A050', 0.1));
  ctx.fillStyle = '#A0783C';
  ctx.beginPath();
  ctx.arc(310, 562, 7, 0, Math.PI * 2);
  ctx.fill();
  // Arms cross
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(298, 576);
  ctx.lineTo(322, 576);
  ctx.stroke();

  // 2 archery targets
  for (const [tx, ty] of [[540, 545], [560, 565]] as [number, number][]) {
    ctx.fillStyle = '#CC0000';
    ctx.beginPath();
    ctx.arc(tx, ty, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#CC0000';
    ctx.beginPath();
    ctx.arc(tx, ty, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sparring ring ellipse
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(400, 620, 60, 20, 0, 0, Math.PI * 2);
  ctx.stroke();

  // ---- DUNGEON CELLS (rest_room) ----
  // Iron bar dividers at x=630, 710, 790
  for (const bx of [630, 710, 790]) {
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2.5;
    for (let bar = 0; bar < 4; bar++) {
      ctx.beginPath();
      ctx.moveTo(bx + bar * 7, 525);
      ctx.lineTo(bx + bar * 7, 715);
      ctx.stroke();
    }
    // Horizontal crossbar
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx, 590);
    ctx.lineTo(bx + 21, 590);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, 650);
    ctx.lineTo(bx + 21, 650);
    ctx.stroke();
  }

  // Cobweb in corner
  ctx.strokeStyle = 'rgba(150,150,150,0.4)';
  ctx.lineWidth = 0.8;
  for (let cw = 0; cw < 3; cw++) {
    ctx.beginPath();
    ctx.moveTo(600, 530);
    ctx.bezierCurveTo(
      600 + cw * 8, 530 + cw * 5,
      620 + cw * 4, 535 + cw * 8,
      618 + cw * 6, 548 + cw * 4
    );
    ctx.stroke();
  }

  // Tiny rat at (920,700)
  ctx.fillStyle = '#4A3A2A';
  ctx.beginPath();
  ctx.ellipse(920, 700, 8, 5, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Tail
  ctx.strokeStyle = '#3A2A1A';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(912, 701);
  ctx.quadraticCurveTo(905, 695, 908, 688);
  ctx.stroke();
  // Eye
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(927, 697, 1, 0, Math.PI * 2);
  ctx.fill();
}

// ===== SHADOW =====
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== TORCH =====
function drawTorch(ctx: CanvasRenderingContext2D, cx: number, cy: number, frameCount: number) {
  // Floor light glow
  const floorGrad = ctx.createRadialGradient(cx, cy + 18, 2, cx, cy + 18, 50);
  floorGrad.addColorStop(0, 'rgba(255,140,0,0.10)');
  floorGrad.addColorStop(1, 'rgba(255,140,0,0)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(cx - 50, cy - 5, 100, 70);

  // Wall bracket
  drawIsoBox(ctx, cx, cy, 8, 4, 6, '#3D2B1F', darkenColor('#3D2B1F', 0.25), darkenColor('#3D2B1F', 0.12));

  const flicker = 1 + Math.sin(frameCount * 0.08) * 0.15;

  ctx.save();
  ctx.shadowBlur = 15 + Math.sin(frameCount * 0.1) * 5;
  ctx.shadowColor = '#FF8C00';

  // Bottom flame — orange
  ctx.fillStyle = '#FF8C00';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 8, 6 * flicker, 5 * flicker, 0, 0, Math.PI * 2);
  ctx.fill();

  // Middle flame — yellow
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 12, 4 * flicker, 4 * flicker, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top flame — white core
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 15, 2 * flicker, 3 * flicker, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ===== TORCHES PLACEMENT =====
function drawTorches(ctx: CanvasRenderingContext2D, frame: number) {
  const torchPositions: [number, number][] = [
    // meeting_room
    [60, 28], [420, 28],
    // server_room
    [550, 28], [900, 28],
    // main_office
    [110, 278], [850, 278],
    // kitchen
    [18, 538], [210, 538],
    // game_room
    [270, 538], [560, 538],
    // rest_room
    [610, 538], [935, 538],
  ];
  for (const [tx, ty] of torchPositions) {
    drawTorch(ctx, tx, ty, frame);
  }
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

  ctx.fillStyle = floorColor1;
  ctx.fillRect(rx, ry, rw, rh);

  const cRange = Math.ceil(rw / ISO_TW) + 4;
  const rRange = Math.ceil(rh / ISO_TH) + 4;

  for (let c = -cRange; c <= cRange; c++) {
    for (let r = -rRange; r <= rRange; r++) {
      const sx = ox + (c - r) * twh;
      const sy = oy + (c + r) * thh;

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

      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Stone crack variant
      if ((c * 7 + r * 13) % 5 === 0) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sx, sy - thh);
        ctx.lineTo(sx + twh, sy);
        ctx.lineTo(sx, sy + thh);
        ctx.lineTo(sx - twh, sy);
        ctx.closePath();
        ctx.clip();
        ctx.strokeStyle = '#5C4A35';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - twh * 0.4, sy - thh * 0.5);
        ctx.lineTo(sx + twh * 0.3, sy + thh * 0.6);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Ambient mood overlay per room
  const moodColors: Record<RoomId, string> = {
    main_office:  'rgba(255,220,150,0.05)',
    meeting_room: 'rgba(180,60,60,0.10)',
    server_room:  'rgba(0,80,180,0.12)',
    kitchen:      'rgba(255,160,80,0.06)',
    game_room:    'rgba(120,0,200,0.12)',
    rest_room:    'rgba(0,60,80,0.15)',
  };
  const moodGrad = ctx.createRadialGradient(ox, oy, 10, ox, oy, Math.max(rw, rh) * 0.65);
  moodGrad.addColorStop(0, moodColors[room.id] || 'rgba(255,248,235,0.06)');
  moodGrad.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = moodGrad;
  ctx.fillRect(rx, ry, rw, rh);

  ctx.restore();
}

// ===== WALLS =====
function drawWalls(ctx: CanvasRenderingContext2D) {
  const wallFace = '#7D6B56';
  const wallTop  = '#9B8970';
  const wallEdge = '#4A3D2E';
  const wallH = 14;

  ctx.strokeStyle = wallEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.fillStyle = wallFace;
  ctx.fillRect(0, 260, W, wallH);
  ctx.fillStyle = wallTop;
  ctx.fillRect(0, 257, W, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 260 + wallH - 2, W, 2);

  ctx.fillStyle = wallFace;
  ctx.fillRect(0, 520, W, wallH);
  ctx.fillStyle = wallTop;
  ctx.fillRect(0, 517, W, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 520 + wallH - 2, W, 2);

  ctx.fillStyle = wallFace;
  ctx.fillRect(480, 0, 8, 260);
  ctx.fillStyle = wallTop;
  ctx.fillRect(478, 0, 4, 260);
  ctx.fillStyle = wallEdge;
  ctx.fillRect(488, 0, 1, 260);

  ctx.fillStyle = wallFace;
  ctx.fillRect(240, 520, 8, H - 520);
  ctx.fillStyle = wallTop;
  ctx.fillRect(238, 520, 4, H - 520);
  ctx.fillStyle = wallEdge;
  ctx.fillRect(248, 520, 1, H - 520);

  ctx.fillStyle = wallFace;
  ctx.fillRect(580, 520, 8, H - 520);
  ctx.fillStyle = wallTop;
  ctx.fillRect(578, 520, 4, H - 520);
  ctx.fillStyle = wallEdge;
  ctx.fillRect(588, 520, 1, H - 520);
}

// ===== DOORWAYS =====
function drawDoorways(ctx: CanvasRenderingContext2D) {
  const wallFace = '#6B5A47';
  for (const door of DOORWAYS) {
    ctx.fillStyle = wallFace;
    ctx.fillRect(door.x, door.y, door.w, door.h + 4);
    ctx.fillStyle = '#3D2E1E';
    ctx.fillRect(door.x - 2, door.y, 4, door.h + 4);
    ctx.fillRect(door.x + door.w - 2, door.y, 4, door.h + 4);
    ctx.fillStyle = '#594838';
    ctx.fillRect(door.x + 2, door.y + 2, door.w - 4, door.h);
    ctx.fillStyle = '#2E2218';
    ctx.fillRect(door.x, door.y + door.h + 2, door.w, 2);
  }
}

// ===== BASEBOARDS =====
function drawBaseboards(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#4A3D2E';
  ctx.fillRect(0, 256, W, 3);
  ctx.fillRect(0, 516, W, 3);
  ctx.fillRect(0, H - 3, 240, 3);
  ctx.fillRect(240, H - 3, 340, 3);
  ctx.fillRect(580, H - 3, 380, 3);
}

// ===== ROOM LABELS (per-room colors) =====
function drawRoomLabel(ctx: CanvasRenderingContext2D, room: RoomDef) {
  const labelColors: Record<RoomId, string> = {
    main_office:  'rgba(240,228,210,0.75)',
    meeting_room: '#FFD700',
    server_room:  '#00E5FF',
    kitchen:      '#FFB347',
    game_room:    '#FF69B4',
    rest_room:    '#80FFCC',
  };
  ctx.fillStyle = labelColors[room.id] || 'rgba(120,100,80,0.5)';
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

    ctx.fillStyle = 'rgba(160,140,110,0.7)';
    ctx.fillRect(win.x + win.w / 2 - 1, win.y, 2, win.h);
    ctx.fillRect(win.x, win.y + win.h / 2 - 1, win.w, 2);

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

  // Suppress frame usage warning
  void frame;
}

// ===== WAR ROOM (meeting_room) =====
function drawWarRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const tx = 210, ty = 128;

  // Dark dramatic oval table
  ctx.fillStyle = '#3D2B1F';
  ctx.beginPath();
  ctx.ellipse(tx, ty, 110, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2E1F14';
  ctx.beginPath();
  ctx.ellipse(tx, ty + 14, 110, 46, 0, 0, Math.PI, false);
  ctx.fill();
  // Table sheen
  ctx.fillStyle = 'rgba(255,200,120,0.07)';
  ctx.beginPath();
  ctx.ellipse(tx - 18, ty - 12, 52, 18, -0.2, 0, Math.PI * 2);
  ctx.fill();
  drawShadow(ctx, tx, ty + 32, 96, 14);

  // Chairs in alternating agent colors
  const agentColors = ['#9333ea','#3b82f6','#22c55e','#14b8a6','#ec4899','#ef4444'];
  const chairPositions = [
    { x: 98, y: 108 }, { x: 178, y: 80 }, { x: 258, y: 80 },
    { x: 338, y: 108 }, { x: 108, y: 162 }, { x: 188, y: 188 },
    { x: 268, y: 188 }, { x: 350, y: 162 },
  ];
  for (let i = 0; i < chairPositions.length; i++) {
    const c = chairPositions[i];
    const col = agentColors[i % agentColors.length];
    drawIsoBox(ctx, c.x, c.y, 20, 10, 10,
      lightenColor(col, 0.15), darkenColor(col, 0.25), col, 'rgba(0,0,0,0.2)');
  }

  // Wall-mounted screen with blue glow
  const scrGlow = (Math.sin(frame * 0.02) + 1) / 2;
  ctx.shadowBlur = 12 + scrGlow * 8;
  ctx.shadowColor = '#1A3A5C';
  ctx.fillStyle = '#0A1820';
  ctx.fillRect(18, 18, 120, 68);
  ctx.shadowBlur = 0;
  // Screen glow lines
  ctx.fillStyle = `rgba(0,120,220,${0.15 + scrGlow * 0.12})`;
  ctx.fillRect(18, 18, 120, 68);
  ctx.strokeStyle = `rgba(0,180,255,${0.3 + scrGlow * 0.2})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(19, 19, 118, 66);
  // Screen content: data lines
  ctx.fillStyle = `rgba(0,200,255,${0.5 + scrGlow * 0.2})`;
  ctx.font = '5px monospace';
  ctx.textAlign = 'left';
  for (let l = 0; l < 6; l++) {
    const lw = 20 + ((l * 17 + Math.floor(frame * 0.1)) % 80);
    ctx.fillRect(24, 26 + l * 9, lw, 1.5);
  }

  // Overall room tension glow
  ctx.fillStyle = `rgba(180,40,40,${0.03 + scrGlow * 0.03})`;
  ctx.fillRect(0, 0, 480, 260);
}

// ===== THE VAULT (server_room) =====
function drawTheVault(ctx: CanvasRenderingContext2D, frame: number) {
  // Cold blue ambient
  const blueGlow = (Math.sin(frame * 0.02) + 1) / 2;
  ctx.fillStyle = `rgba(0,40,120,${0.06 + blueGlow * 0.04})`;
  ctx.fillRect(480, 0, 480, 260);

  // 4 server racks
  const rackPositions = [
    { x: 560, y: 90 }, { x: 650, y: 75 }, { x: 760, y: 90 }, { x: 860, y: 75 },
  ];
  for (let i = 0; i < rackPositions.length; i++) {
    const rp = rackPositions[i];
    drawServerRack(ctx, rp.x, rp.y, frame, i);
  }

  // Cable floor traces between racks
  ctx.strokeStyle = `rgba(0,100,200,${0.25 + blueGlow * 0.15})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < rackPositions.length - 1; i++) {
    const a = rackPositions[i];
    const b = rackPositions[i + 1];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + 80);
    ctx.bezierCurveTo(a.x + 20, a.y + 100, b.x - 20, b.y + 100, b.x, b.y + 80);
    ctx.stroke();
  }

  // Temperature display
  ctx.fillStyle = '#0A0A18';
  ctx.fillRect(900, 40, 48, 22);
  ctx.strokeStyle = '#00E5FF44';
  ctx.lineWidth = 1;
  ctx.strokeRect(900, 40, 48, 22);
  ctx.fillStyle = '#00E5FF';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('19°C', 924, 55);

  // Radial ambient glow from racks
  for (const rp of rackPositions) {
    const rg = ctx.createRadialGradient(rp.x, rp.y + 40, 5, rp.x, rp.y + 40, 60);
    rg.addColorStop(0, `rgba(0,150,255,${0.08 + blueGlow * 0.06})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(rp.x - 60, rp.y - 10, 120, 120);
  }
}

function drawServerRack(ctx: CanvasRenderingContext2D, cx: number, cy: number, frame: number, idx: number) {
  // Tall iso box
  drawIsoBox(ctx, cx, cy, 38, 19, 120,
    '#2A2A3A', '#18181E', '#222230', '#111118');

  // LED dots on front face (right face of iso box)
  for (let j = 0; j < 8; j++) {
    const ledY = cy + 18 + j * 14;
    // Green activity LED
    const pulse = (Math.sin(frame * 0.04 + idx * 1.7 + j * 0.9) + 1) / 2;
    const g = Math.floor(80 + pulse * 175);
    ctx.fillStyle = `rgb(0,${g},0)`;
    ctx.beginPath();
    ctx.arc(cx + 8, ledY, 1.8, 0, Math.PI * 2);
    ctx.fill();
    // Alert or blue LED (alternating)
    const isAlert = Math.sin(frame * 0.025 + idx * 2.3 + j) > 0.94;
    ctx.fillStyle = isAlert ? '#ef4444' : `rgba(0,180,255,${0.5 + pulse * 0.5})`;
    ctx.beginPath();
    ctx.arc(cx + 14, ledY, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShadow(ctx, cx, cy + 130, 22, 5);
}

// ===== THE FLOOR (main_office) =====
function drawTheFloor(ctx: CanvasRenderingContext2D, frame: number, agents: AgentState[]) {
  // Large plants in corners
  drawIsoPlant(ctx, 55, 296, frame, 0);
  drawIsoPlant(ctx, 910, 296, frame, 100);
  drawIsoPlant(ctx, 55, 458, frame, 200);
  drawIsoPlant(ctx, 910, 458, frame, 300);

  // Water cooler
  ctx.shadowBlur = 4;
  ctx.shadowColor = '#B3D9F044';
  drawIsoBox(ctx, 38, 368, 20, 10, 28, '#B3D9F0', '#7AADC8', '#98C4DC', 'rgba(0,0,0,0.15)');
  ctx.shadowBlur = 0;
  // Water jug
  ctx.fillStyle = '#4488CC66';
  ctx.beginPath();
  ctx.ellipse(38, 357, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ceiling light diamonds above each desk cluster
  const lightX = [80, 220, 360, 520, 680, 840, 140, 300, 460, 620, 780];
  for (const lx of lightX) {
    const ly = 275;
    const glow = (Math.sin(frame * 0.02 + lx * 0.01) + 1) / 2;
    drawIsoDiamond(ctx, lx, ly, 14, 7, `rgba(255,230,120,${0.7 + glow * 0.15})`);
    // Light spill on floor
    const lg = ctx.createRadialGradient(lx, ly + 30, 2, lx, ly + 30, 50);
    lg.addColorStop(0, `rgba(255,240,180,${0.06 + glow * 0.04})`);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(lx - 50, ly + 5, 100, 80);
  }

  // Window light diagonal stripe
  ctx.fillStyle = 'rgba(255,240,200,0.04)';
  ctx.beginPath();
  ctx.moveTo(0, 260);
  ctx.lineTo(120, 260);
  ctx.lineTo(0, 340);
  ctx.closePath();
  ctx.fill();

  // Desks — back row first
  const row0 = agents.filter(a => { const d = DESK_LAYOUT[a.desk]; return d && d.row === 0; });
  const row1 = agents.filter(a => { const d = DESK_LAYOUT[a.desk]; return d && d.row === 1; });
  for (const agent of row0) {
    const desk = DESK_LAYOUT[agent.desk];
    if (desk) drawIsoDesk(ctx, desk.x, desk.y, agent, frame);
  }
  for (const agent of row1) {
    const desk = DESK_LAYOUT[agent.desk];
    if (desk) drawIsoDesk(ctx, desk.x, desk.y, agent, frame);
  }
}

// ===== THE PIT (kitchen) =====
function drawThePit(ctx: CanvasRenderingContext2D, frame: number) {
  const kx = 20, ky = 542;

  // L-shaped couch (two iso boxes)
  drawIsoBox(ctx, kx + 168, ky + 40, 72, 36, 22, '#E8943A', darkenColor('#E8943A', 0.25), darkenColor('#E8943A', 0.12), 'rgba(0,0,0,0.15)');
  drawIsoBox(ctx, kx + 112, ky + 72, 54, 27, 22, lightenColor('#E8943A', 0.08), darkenColor('#E8943A', 0.28), darkenColor('#E8943A', 0.14), 'rgba(0,0,0,0.15)');
  // Couch cushion highlights
  ctx.fillStyle = 'rgba(255,200,100,0.12)';
  ctx.beginPath();
  ctx.ellipse(kx + 168, ky + 36, 28, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Espresso machine
  drawCoffeeMachine(ctx, kx + 58, ky - 10, frame);

  // Small round table (iso box short and wide)
  drawIsoBox(ctx, kx + 155, ky + 110, 36, 18, 10, '#C4956A', '#8B6914', '#A07830', 'rgba(0,0,0,0.15)');
  // Two stools
  drawIsoBox(ctx, kx + 128, ky + 125, 16, 8, 8, '#D4B894', '#A88C66', '#C4A882', 'rgba(0,0,0,0.12)');
  drawIsoBox(ctx, kx + 182, ky + 125, 16, 8, 8, '#D4B894', '#A88C66', '#C4A882', 'rgba(0,0,0,0.12)');

  // Large corner plant
  drawIsoPlant(ctx, kx + 205, ky - 5, frame, 50);

  // 'Pixel lives here' subtle paw mark on floor
  ctx.fillStyle = 'rgba(180,120,60,0.1)';
  ctx.font = '14px serif';
  ctx.textAlign = 'center';
  ctx.fillText('🐾', kx + 90, ky + 75);
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, cx: number, cy: number, frame: number) {
  drawIsoBox(ctx, cx, cy, 30, 15, 26, '#C8C8C8', '#888888', '#A8A8A8', 'rgba(0,0,0,0.2)');
  // Control panel
  ctx.fillStyle = '#444';
  ctx.fillRect(cx - 10, cy - 9, 10, 6);
  // Cup
  ctx.fillStyle = '#F5F5F0';
  ctx.beginPath();
  ctx.ellipse(cx + 8, cy + 14, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5A3010';
  ctx.beginPath();
  ctx.ellipse(cx + 8, cy + 14, 4.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Steam
  const steamOpacity = (Math.sin(frame * 0.05) + 1) / 2;
  for (let i = 0; i < 3; i++) {
    const sy = cy - 8 - i * 6 - Math.sin(frame * 0.06 + i) * 3;
    const sx = cx + Math.sin(frame * 0.04 + i * 1.8) * 3;
    ctx.fillStyle = `rgba(220,215,210,${(0.35 - i * 0.1) * steamOpacity})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===== THE ARCADE (game_room) =====
function drawTheArcade(ctx: CanvasRenderingContext2D, frame: number) {
  const gx = 260, gy = 525;

  // Neon strip along floor edge
  const neonPulse = (Math.sin(frame * 0.08) + 1) / 2;
  ctx.shadowBlur = 8;
  ctx.shadowColor = '#FF00FF';
  ctx.strokeStyle = `rgba(255,0,255,${0.6 + neonPulse * 0.3})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gx, gy + 195);
  ctx.lineTo(gx + 330, gy + 195);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Arcade machine 1 — hot pink
  drawArcadeMachine(ctx, gx + 50, gy + 60, '#FF4080', frame);
  // Arcade machine 2 — cyan
  drawArcadeMachine(ctx, gx + 160, gy + 45, '#40C0FF', frame);

  // Bean bag chairs
  const beanbags = [
    { x: gx + 255, y: gy + 75, color: '#6A20A0' },
    { x: gx + 290, y: gy + 105, color: '#1A4080' },
    { x: gx + 230, y: gy + 110, color: '#104A30' },
    { x: gx + 265, y: gy + 140, color: '#802040' },
  ];
  for (const bb of beanbags) {
    drawShadow(ctx, bb.x, bb.y + 12, 20, 6);
    ctx.fillStyle = bb.color;
    ctx.beginPath();
    ctx.ellipse(bb.x, bb.y, 20, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lightenColor(bb.color, 0.35) + '44';
    ctx.beginPath();
    ctx.ellipse(bb.x - 4, bb.y - 5, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawArcadeMachine(ctx: CanvasRenderingContext2D, cx: number, cy: number, screenColor: string, frame: number) {
  const bodyColor = screenColor === '#FF4080' ? '#1A0820' : '#081820';
  drawIsoBox(ctx, cx, cy, 32, 16, 58,
    lightenColor(bodyColor, 0.05), darkenColor(bodyColor, 0.1), bodyColor, 'rgba(0,0,0,0.3)');

  // Screen on top face
  const scrPulse = (Math.sin(frame * 0.07 + cx * 0.01) + 1) / 2;
  ctx.shadowBlur = 10 + scrPulse * 6;
  ctx.shadowColor = screenColor;
  ctx.fillStyle = screenColor + 'AA';
  ctx.fillRect(cx - 11, cy - 10, 22, 14);
  ctx.shadowBlur = 0;
  // Screen scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let sl = 0; sl < 7; sl++) {
    ctx.fillRect(cx - 11, cy - 10 + sl * 2, 22, 1);
  }

  // Controls (front face buttons)
  ctx.fillStyle = '#FF4444';
  ctx.beginPath(); ctx.arc(cx + 8, cy + 36, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#44AAFF';
  ctx.beginPath(); ctx.arc(cx + 14, cy + 42, 2.5, 0, Math.PI * 2); ctx.fill();

  drawShadow(ctx, cx, cy + 70, 18, 5);
}

// ===== SLEEP PODS (rest_room) =====
function drawSleepPods(ctx: CanvasRenderingContext2D, frame: number) {
  const rx = 580, ry = 520;

  // Very dark ambient
  ctx.fillStyle = 'rgba(5,5,15,0.3)';
  ctx.fillRect(rx, ry, 380, 200);

  // Star ceiling
  const starPositions = [
    [40,18],[80,12],[120,22],[160,10],[200,20],[250,16],[300,8],[330,24],[60,38],[180,36],
  ];
  for (const [sx, sy] of starPositions) {
    const twinkle = Math.sin(frame * 0.04 + sx * 0.2 + sy * 0.3);
    ctx.fillStyle = `rgba(200,200,255,${Math.max(0.08, 0.18 + twinkle * 0.15)})`;
    ctx.fillRect(rx + sx, ry + sy, 1.5, 1.5);
  }

  // 3 sleep pods
  const podPositions = [
    { x: rx + 68, y: ry + 80 },
    { x: rx + 198, y: ry + 70 },
    { x: rx + 318, y: ry + 80 },
  ];
  for (let i = 0; i < podPositions.length; i++) {
    drawSleepPod(ctx, podPositions[i].x, podPositions[i].y, frame, i);
  }

  // Extra beds for overflow agents
  const bedColors = ['#1A1430', '#12182A', '#101828'];
  const extraBeds = [
    { x: rx + 68, y: ry + 145 }, { x: rx + 198, y: ry + 138 },
    { x: rx + 318, y: ry + 145 }, { x: rx + 90, y: ry + 175 },
    { x: rx + 230, y: ry + 168 }, { x: rx + 350, y: ry + 175 },
  ];
  for (let i = 0; i < extraBeds.length; i++) {
    const pos = extraBeds[i];
    const col = bedColors[i % bedColors.length];
    drawIsoBox(ctx, pos.x, pos.y, 46, 12, 7,
      lightenColor(col, 0.1), darkenColor(col, 0.1), col, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = lightenColor(col, 0.25) + '44';
    ctx.beginPath();
    ctx.ellipse(pos.x - 14, pos.y - 3, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSleepPod(ctx: CanvasRenderingContext2D, cx: number, cy: number, frame: number, idx: number) {
  const tealPulse = (Math.sin(frame * 0.04 + idx * 1.4) + 1) / 2;
  // Pod body
  drawIsoBox(ctx, cx, cy, 70, 20, 20,
    '#1E1E2E', '#111118', '#18182A', 'rgba(0,0,0,0.2)');
  // Visor strip on top face
  ctx.shadowBlur = 8 + tealPulse * 6;
  ctx.shadowColor = '#00FFAA';
  ctx.fillStyle = `rgba(0,255,170,${0.6 + tealPulse * 0.3})`;
  ctx.fillRect(cx - 28, cy - 8, 56, 4);
  ctx.shadowBlur = 0;
  // Pod shadow
  drawShadow(ctx, cx, cy + 28, 36, 6);
}

// ===== ISO PLANT =====
function drawIsoPlant(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, offset: number) {
  const sway = Math.sin(frame * 0.012 + offset * 0.01) * 1.2;
  drawShadow(ctx, x, y + 18, 10, 3);
  drawIsoBox(ctx, x, y + 10, 18, 9, 12, '#C4845A', '#8B5A30', '#A86E42', 'rgba(0,0,0,0.15)');
  ctx.fillStyle = '#5A3A20';
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#166534';
  ctx.fillRect(x - 1, y - 10, 2, 14);
  // Three stacked leaf circles
  ctx.fillStyle = '#5C8A3C';
  ctx.beginPath();
  ctx.ellipse(x + sway - 4, y - 5, 10, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + sway + 4, y - 8, 10, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4A7A2A';
  ctx.beginPath();
  ctx.ellipse(x + sway, y - 13, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== ISO DESK =====
function drawIsoDesk(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const deskTop = '#C4956A';
  const deskLeft = '#8B6914';
  const deskRight = '#A07830';
  drawIsoBox(ctx, x, y + 18, 52, 26, 18, deskTop, deskLeft, deskRight, 'rgba(0,0,0,0.18)');

  const monContent = MONITOR_CONTENT[agent.desk] || 'default';
  drawIsoMonitor(ctx, x - 6, y - 4, agent.color, frame, monContent);

  drawIsoBox(ctx, x, y + 46, 20, 10, 10,
    lightenColor(agent.color, 0.1), darkenColor(agent.color, 0.2), agent.color, 'rgba(0,0,0,0.12)');
}

// ===== ISO MONITOR =====
function drawIsoMonitor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, frame: number, content: string) {
  drawIsoBox(ctx, x, y, 22, 11, 18, '#2A2A3E', '#1A1A28', '#222232', 'rgba(0,0,0,0.3)');
  const scrX = x - 8, scrY = y - 8;
  const scrW = 16, scrH = 10;
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(scrX, scrY, scrW, scrH);
  drawMonitorContent(ctx, scrX, scrY, scrW, scrH, color, frame, content);
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

// ===== PIXEL THE DOG =====
function drawPixelDog(ctx: CanvasRenderingContext2D, pet: PetState, frame: number) {
  const { x, y, wagFrame } = pet;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#C8860A';
  ctx.beginPath();
  ctx.ellipse(x, y, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly lighter patch
  ctx.fillStyle = '#DCA840';
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 1, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head (front-right of body)
  ctx.fillStyle = '#D4920C';
  ctx.beginPath();
  ctx.arc(x + 8, y - 3, 6, 0, Math.PI * 2);
  ctx.fill();

  // Floppy ears
  ctx.fillStyle = '#8B5E0A';
  ctx.beginPath();
  ctx.ellipse(x + 5, y + 2, 3, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 11, y + 1, 3, 5, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(x + 7, y - 4, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 10, y - 4, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x + 6.5, y - 4.5, 0.8, 0.8);
  ctx.fillRect(x + 9.5, y - 4.5, 0.8, 0.8);

  // Nose
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(x + 13, y - 2, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail wag
  const tailAngle = wagFrame === 0 ? 0.4 : -0.4;
  ctx.strokeStyle = '#C8860A';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 2);
  ctx.quadraticCurveTo(
    x - 14 + Math.sin(tailAngle) * 4, y - 8 + Math.cos(tailAngle) * 2,
    x - 12 + Math.sin(tailAngle) * 8, y - 12 + Math.cos(tailAngle) * 4
  );
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Legs (4 tiny dots)
  ctx.fillStyle = '#A06808';
  const legBob = pet.moving ? Math.sin(frame * 0.25) * 1.5 : 0;
  ctx.beginPath(); ctx.ellipse(x - 4, y + 7 + legBob, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 2, y + 7 - legBob, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 5, y + 7 + legBob, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 9, y + 7 - legBob, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();

  // Name label: 'Pixel 🐾'
  const label = 'Pixel 🐾';
  const lw = label.length * 4.8 + 8;
  ctx.fillStyle = 'rgba(10,10,15,0.55)';
  ctx.beginPath();
  ctx.roundRect(x - lw / 2 + 4, y - 22, lw, 10, 3);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + 4, y - 14);
}

// ===== AGENT DRAWING =====
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

function drawChibiBody(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, bobY: number) {
  const tw = 18, th = 10, bh = 14;
  const cy = y + bobY;
  drawIsoBox(ctx, x, cy, tw, th, bh,
    lightenColor(agent.color, 0.18),
    darkenColor(agent.color, 0.18),
    agent.color,
    'rgba(0,0,0,0.2)'
  );
}

function drawChibiHead(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number, bobY: number) {
  const headX = x;
  const headY = y - 16 + bobY;

  ctx.fillStyle = '#FDBCB4';
  ctx.beginPath();
  ctx.arc(headX, headY, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,160,160,0.3)';
  ctx.beginPath();
  ctx.ellipse(headX - 5, headY + 2, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(headX + 5, headY + 2, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = darkenColor(agent.color, 0.3);
  ctx.beginPath();
  ctx.arc(headX, headY - 1, 8, Math.PI * 0.9, Math.PI * 2.1);
  ctx.lineTo(headX, headY - 1);
  ctx.closePath();
  ctx.fill();

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

  drawChibiBody(ctx, x, dy, agent, bob);
  drawChibiHead(ctx, x, dy, agent, frame, bob);
  drawStatusDot(ctx, x + 11, dy - 22 + bob, agent.status, frame);
  drawAgentName(ctx, x, dy + 32, agent.name, agent.status);
}

function drawWalkingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, anim: AnimAgent, frame: number) {
  const walkPhase = (anim.walkFrame % 30) / 30;
  const bob = Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 2;
  const dy = y - 5;

  drawChibiBody(ctx, x, dy, agent, -bob);
  drawChibiHead(ctx, x, dy, agent, frame, -bob);

  const legOff = Math.sin(walkPhase * Math.PI * 2) * 5;
  ctx.fillStyle = darkenColor(agent.color, 0.4);
  ctx.beginPath(); ctx.ellipse(x - 4, dy + 28 - legOff / 2, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 4, dy + 28 + legOff / 2, 3, 2, 0, 0, Math.PI * 2); ctx.fill();

  drawAgentName(ctx, x, dy + 36, agent.name, agent.status);
}

function drawSleepingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const breathe = Math.sin(frame * 0.03) * 0.6;
  const dy = y - 5;

  drawIsoBox(ctx, x, dy + breathe, 28, 12, 8,
    lightenColor(agent.color, 0.18),
    darkenColor(agent.color, 0.18),
    agent.color,
    'rgba(0,0,0,0.15)'
  );

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

  ctx.fillStyle = '#555';
  ctx.fillRect(x - 19, dy - 2 + breathe, 3, 1);
  ctx.fillRect(x - 14, dy - 2 + breathe, 3, 1);

  ctx.fillStyle = 'rgba(60,40,100,0.4)';
  ctx.beginPath();
  ctx.moveTo(x - 10, dy + 4 + breathe);
  ctx.lineTo(x + 16, dy + 2 + breathe);
  ctx.lineTo(x + 14, dy + 14 + breathe);
  ctx.lineTo(x - 12, dy + 16 + breathe);
  ctx.closePath();
  ctx.fill();

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

  drawChibiBody(ctx, x, dy, agent, bob);
  drawChibiHead(ctx, x, dy, agent, frame, bob);

  drawIsoBox(ctx, x + 14, dy + 12 + bob, 10, 5, 7, '#F5F5F0', '#D0D0C8', '#E0E0D8');
  ctx.fillStyle = '#8B6914';
  ctx.beginPath();
  ctx.ellipse(x + 14, dy + 9 + bob, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
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

  drawChibiBody(ctx, x, dy, agent, bob);
  drawChibiHead(ctx, x, dy, agent, frame, bob);

  if (gesturing) {
    ctx.fillStyle = agent.color;
    ctx.beginPath();
    ctx.ellipse(x - 12, dy - 4 + bob, 4, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
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

  drawChibiBody(ctx, x + lean, dy, agent, 0);
  drawChibiHead(ctx, x + lean, dy, agent, frame, 0);

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

// Keep AGENTS import used
void AGENTS;
