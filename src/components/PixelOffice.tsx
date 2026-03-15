'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { AgentState, RoomId } from '@/lib/agents';

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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const num = parseInt(hex.replace('#', ''), 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
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
  { id: 'meeting_room', label: 'MEETING ROOM', emoji: '🤝', x: 0, y: 0, w: 440, h: 260, floorColor1: '#1e2438', floorColor2: '#1a2030', tileSize: 28 },
  { id: 'server_room', label: 'SERVER ROOM', emoji: '🖥️', x: 440, y: 0, w: 520, h: 260, floorColor1: '#1a1a28', floorColor2: '#151522', tileSize: 24 },
  { id: 'main_office', label: 'MAIN OFFICE', emoji: '🏢', x: 0, y: 260, w: 960, h: 260, floorColor1: '#1e1e35', floorColor2: '#18182c', tileSize: 32 },
  { id: 'kitchen', label: 'KITCHEN', emoji: '🍳', x: 0, y: 520, w: 300, h: 200, floorColor1: '#2a2418', floorColor2: '#221e14', tileSize: 26 },
  { id: 'game_room', label: 'GAME ROOM', emoji: '🎮', x: 300, y: 520, w: 660, h: 200, floorColor1: '#1a1e2e', floorColor2: '#151828', tileSize: 30 },
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

// ===== FIX 1: Spread-out positions — no stacking! =====
// Kitchen: spread across counter stools with 70px+ spacing
const KITCHEN_SPOTS = [
  { x: 55, y: 595 },
  { x: 130, y: 600 },
  { x: 205, y: 595 },
  { x: 80, y: 650 },
  { x: 165, y: 655 },
  { x: 245, y: 650 },
];

// Game room: active agents — well-spaced
const GAME_ROOM_SPOTS = [
  { x: 380, y: 585 },
  { x: 470, y: 595 },
  { x: 560, y: 585 },
  { x: 650, y: 595 },
  { x: 420, y: 650 },
  { x: 510, y: 655 },
  { x: 600, y: 650 },
  { x: 740, y: 590 },
];

// Beanbag/sleep spots — unique positions, 70px+ apart
const BEANBAG_SPOTS = [
  { x: 700, y: 620 },
  { x: 780, y: 640 },
  { x: 860, y: 620 },
  { x: 740, y: 680 },
  { x: 820, y: 690 },
  { x: 900, y: 670 },
  { x: 660, y: 670 },
  { x: 580, y: 680 },
  { x: 500, y: 690 },
  { x: 420, y: 680 },
  { x: 340, y: 670 },
];

const MEETING_SPOTS = [
  { x: 120, y: 100 }, { x: 200, y: 80 }, { x: 280, y: 100 },
  { x: 120, y: 160 }, { x: 200, y: 180 }, { x: 280, y: 160 },
  { x: 360, y: 100 }, { x: 360, y: 160 },
];

// ===== DOORWAY POSITIONS =====
const DOORWAYS = [
  { x: 200, y: 250, w: 60, h: 20 },
  { x: 460, y: 250, w: 60, h: 20 },
  { x: 700, y: 250, w: 60, h: 20 },
  { x: 130, y: 510, w: 60, h: 20 },
  { x: 450, y: 510, w: 80, h: 20 },
];

// ===== AGENT ANIMATION STATE =====
interface AnimAgent {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  room: RoomId;
  targetRoom: RoomId;
  walkFrame: number;
  state: 'sitting' | 'walking' | 'standing' | 'sleeping' | 'coffee' | 'meeting' | 'gaming';
  gestureFrame: number;
  idleOffset: number; // stagger idle animations
}

interface PixelOfficeProps {
  agents: AgentState[];
}

export default function PixelOffice({ agents }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);
  const agentAnimRef = useRef<Map<string, AnimAgent>>(new Map());
  const prevAgentsRef = useRef<AgentState[]>([]);

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

    if (room === 'game_room') {
      if (agent.status === 'offline') {
        const sleepAgents = allAgents.filter(a => a.room === 'game_room' && a.status === 'offline');
        const idx = sleepAgents.findIndex(a => a.id === agent.id);
        const spot = BEANBAG_SPOTS[idx % BEANBAG_SPOTS.length];
        return { x: spot.x, y: spot.y, state: 'sleeping' };
      }
      const gameAgents = allAgents.filter(a => a.room === 'game_room' && a.status !== 'offline');
      const idx = gameAgents.findIndex(a => a.id === agent.id);
      const spot = GAME_ROOM_SPOTS[idx % GAME_ROOM_SPOTS.length];
      return { x: spot.x, y: spot.y, state: 'gaming' };
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
          id: agent.id,
          x: target.x, y: target.y,
          targetX: target.x, targetY: target.y,
          room: agent.room, targetRoom: agent.room,
          walkFrame: 0,
          state: target.state,
          gestureFrame: 0,
          idleOffset: Math.random() * 1000,
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
    prevAgentsRef.current = agents;
  }, [agents, getTargetPosition]);

  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    ctx.imageSmoothingEnabled = false;

    // Draw rooms
    for (const room of ROOMS) {
      drawRoomFloor(ctx, room, frame);
    }

    // Windows on walls
    drawWindows(ctx, frame);

    // Walls
    drawWalls(ctx);
    drawDoorways(ctx);

    // Baseboard trim
    drawBaseboards(ctx);

    // Room labels
    for (const room of ROOMS) {
      drawRoomLabel(ctx, room);
    }

    // Furniture
    drawMeetingRoom(ctx, frame);
    drawServerRoom(ctx, frame);
    drawMainOfficeDesks(ctx, frame, agents);
    drawKitchen(ctx, frame);
    drawGameRoom(ctx, frame);

    // Wall decorations
    drawWallDecorations(ctx, frame);

    // Day/night
    drawDayNightOverlay(ctx);

    // Clock
    drawClock(ctx);

    // Agents (sorted by Y for depth)
    const animMap = agentAnimRef.current;
    const sortedAgents = [...agents].sort((a, b) => {
      const aa = animMap.get(a.id);
      const ab = animMap.get(b.id);
      return (aa?.y || 0) - (ab?.y || 0);
    });

    for (const agent of sortedAgents) {
      const anim = animMap.get(agent.id);
      if (!anim) continue;

      // Move towards target with ease-in-out
      const dx = anim.targetX - anim.x;
      const dy = anim.targetY - anim.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        // Ease: faster in middle, slower at edges
        const speed = Math.min(2.2, 0.5 + dist * 0.02);
        anim.x += (dx / dist) * speed;
        anim.y += (dy / dist) * speed;
        anim.walkFrame++;
        anim.state = 'walking';
      } else {
        anim.x = anim.targetX;
        anim.y = anim.targetY;
        anim.room = anim.targetRoom;
        const target = getTargetPosition(agent, agents);
        anim.state = target.state;
      }

      anim.gestureFrame = frame;

      // Shadow under agent
      drawShadow(ctx, anim.x, anim.y + 28, 14, 4);

      drawAgent48(ctx, anim.x, anim.y, agent, anim, frame);
    }

    // Ambient
    drawAmbient(ctx, frame);

  }, [agents, getTargetPosition]);

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
    <div className="relative w-full h-full flex items-center justify-center bg-[#0a0a0f]">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="border border-[#2a2a3e] rounded-lg"
        style={{ imageRendering: 'pixelated', width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}

// ===== SHADOW =====
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== ROOM DRAWING =====
function drawRoomFloor(ctx: CanvasRenderingContext2D, room: RoomDef, frame: number) {
  const { x, y, w, h, floorColor1, floorColor2, tileSize } = room;

  // Base fill
  ctx.fillStyle = floorColor1;
  ctx.fillRect(x, y, w, h);

  // Tile pattern
  for (let tx = x; tx < x + w; tx += tileSize) {
    for (let ty = y; ty < y + h; ty += tileSize) {
      const col = Math.floor((tx - x) / tileSize);
      const row = Math.floor((ty - y) / tileSize);
      const isLight = (col + row) % 2 === 0;
      ctx.fillStyle = isLight ? floorColor1 : floorColor2;
      ctx.fillRect(tx, ty, tileSize, tileSize);

      // Subtle tile edge on every other tile
      if (isLight) {
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(tx, ty, tileSize, 1);
        ctx.fillRect(tx, ty, 1, tileSize);
      }
    }
  }

  // Room lighting — radial gradient from center (ceiling light)
  const cx = x + w / 2;
  const cy = y + h / 2;
  const grad = ctx.createRadialGradient(cx, cy - 30, 10, cx, cy, Math.max(w, h) * 0.6);
  grad.addColorStop(0, 'rgba(255,255,240,0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

function drawWindows(ctx: CanvasRenderingContext2D, frame: number) {
  // Windows on the top wall of meeting room
  const windows = [
    { x: 30, y: 15, w: 50, h: 35 },
    { x: 120, y: 15, w: 50, h: 35 },
    { x: 350, y: 15, w: 50, h: 35 },
  ];

  for (const win of windows) {
    // Window frame (dark outline)
    ctx.fillStyle = '#2a2a40';
    ctx.fillRect(win.x - 2, win.y - 2, win.w + 4, win.h + 4);

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(win.x, win.y, win.x, win.y + win.h);
    skyGrad.addColorStop(0, '#1a2844');
    skyGrad.addColorStop(1, '#2a3858');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(win.x, win.y, win.w, win.h);

    // Stars (tiny dots)
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(win.x + 8, win.y + 6, 1, 1);
    ctx.fillRect(win.x + 25, win.y + 12, 1, 1);
    ctx.fillRect(win.x + 40, win.y + 8, 1, 1);
    ctx.fillRect(win.x + 15, win.y + 22, 1, 1);

    // Window divider (cross)
    ctx.fillStyle = '#3a3a5e';
    ctx.fillRect(win.x + win.w / 2 - 1, win.y, 2, win.h);
    ctx.fillRect(win.x, win.y + win.h / 2 - 1, win.w, 2);

    // Light spill on floor
    ctx.fillStyle = 'rgba(100,140,200,0.02)';
    ctx.fillRect(win.x - 10, win.y + win.h + 5, win.w + 20, 40);
  }
}

function drawBaseboards(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#2a2a40';
  // Bottom of each wall where meets floor
  // Meeting room bottom
  ctx.fillRect(0, 256, 440, 4);
  // Server room bottom
  ctx.fillRect(440, 256, 520, 4);
  // Main office bottom
  ctx.fillRect(0, 516, 960, 4);
  // Kitchen bottom (left wall)
  ctx.fillRect(0, H - 4, 300, 4);
  // Game room bottom
  ctx.fillRect(300, H - 4, 660, 4);
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.beginPath();
  ctx.moveTo(0, 260); ctx.lineTo(W, 260);
  ctx.moveTo(0, 520); ctx.lineTo(W, 520);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(440, 0); ctx.lineTo(440, 260);
  ctx.moveTo(300, 520); ctx.lineTo(300, H);
  ctx.stroke();

  // Glass wall for meeting room
  ctx.strokeStyle = '#6366f118';
  ctx.lineWidth = 5;
  ctx.strokeRect(4, 4, 432, 252);
}

function drawDoorways(ctx: CanvasRenderingContext2D) {
  for (const door of DOORWAYS) {
    ctx.fillStyle = '#1e1e35';
    ctx.fillRect(door.x, door.y, door.w, door.h);
    ctx.fillStyle = '#4a4a6e';
    ctx.fillRect(door.x - 2, door.y, 4, door.h);
    ctx.fillRect(door.x + door.w - 2, door.y, 4, door.h);
  }
}

function drawRoomLabel(ctx: CanvasRenderingContext2D, room: RoomDef) {
  ctx.fillStyle = '#6b728066';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${room.emoji} ${room.label}`, room.x + 8, room.y + 16);
}

// ===== WALL DECORATIONS =====
function drawWallDecorations(ctx: CanvasRenderingContext2D, frame: number) {
  // Company logo on main office wall
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(440, 268, 80, 20);
  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('⚡ ARENA HQ', 480, 282);

  // Sticky notes on wall near desks
  const stickyColors = ['#fbbf24', '#22c55e', '#ec4899', '#3b82f6'];
  for (let i = 0; i < 4; i++) {
    const sx = 560 + i * 22;
    ctx.fillStyle = stickyColors[i] + '44';
    ctx.fillRect(sx, 270, 16, 16);
    ctx.fillStyle = stickyColors[i] + '22';
    ctx.fillRect(sx + 2, 274, 8, 1);
    ctx.fillRect(sx + 2, 277, 10, 1);
    ctx.fillRect(sx + 2, 280, 6, 1);
  }

  // Water cooler in main office
  drawWaterCooler(ctx, 30, 350, frame);

  // Coat rack near kitchen door
  drawCoatRack(ctx, 90, 485);
}

function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  // Body
  ctx.fillStyle = '#d0d0e0';
  ctx.fillRect(x, y, 16, 30);
  // Outline
  ctx.strokeStyle = '#8888a0';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, 16, 30);
  // Water jug
  ctx.fillStyle = '#4488cc44';
  ctx.fillRect(x + 2, y - 12, 12, 14);
  ctx.strokeStyle = '#4488cc66';
  ctx.strokeRect(x + 2, y - 12, 12, 14);
  // Tap
  ctx.fillStyle = '#888';
  ctx.fillRect(x + 14, y + 10, 4, 3);
  // Shadow
  drawShadow(ctx, x + 8, y + 32, 10, 3);
}

function drawCoatRack(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Pole
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(x, y, 3, 30);
  // Base
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(x - 6, y + 28, 15, 4);
  // Hooks
  ctx.fillStyle = '#888';
  ctx.fillRect(x - 4, y + 2, 4, 2);
  ctx.fillRect(x + 2, y + 2, 4, 2);
  // Coat
  ctx.fillStyle = '#3a3a5e';
  ctx.fillRect(x - 5, y + 4, 6, 12);
}

// ===== MEETING ROOM =====
function drawMeetingRoom(ctx: CanvasRenderingContext2D, frame: number) {
  // Oval table with outline and shading
  ctx.fillStyle = '#3d321e';
  ctx.beginPath();
  ctx.ellipse(210, 130, 100, 45, 0, 0, Math.PI * 2);
  ctx.fill();
  // Outline
  ctx.strokeStyle = '#2a2010';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(210, 130, 100, 45, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Top highlight
  ctx.fillStyle = '#4a3e2833';
  ctx.beginPath();
  ctx.ellipse(210, 125, 80, 35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shadow under table
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(210, 178, 90, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Chairs
  const chairPositions = [
    { x: 110, y: 100 }, { x: 210, y: 75 }, { x: 310, y: 100 },
    { x: 110, y: 160 }, { x: 210, y: 185 }, { x: 310, y: 160 },
  ];
  for (const c of chairPositions) {
    drawPixelChair(ctx, c.x, c.y);
  }

  // Whiteboard with outlines
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(20, 30, 120, 60);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 30, 120, 60);
  // Inner border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(23, 33, 114, 54);
  // Content
  ctx.fillStyle = '#333';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Sprint Goals:', 28, 48);
  ctx.fillStyle = '#2563eb';
  ctx.fillText('• Office v2.0', 28, 60);
  ctx.fillStyle = '#22c55e';
  ctx.fillText('• Pixel Art ✓', 28, 72);
  // Markers tray
  ctx.fillStyle = '#e0e0d0';
  ctx.fillRect(22, 90, 118, 4);
  ctx.fillStyle = '#ef4444';  ctx.fillRect(30, 90, 10, 3);
  ctx.fillStyle = '#22c55e';  ctx.fillRect(44, 90, 10, 3);
  ctx.fillStyle = '#3b82f6';  ctx.fillRect(58, 90, 10, 3);
  ctx.fillStyle = '#111';     ctx.fillRect(72, 90, 10, 3);
}

function drawPixelChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Seat
  ctx.fillStyle = '#4a4a5e';
  ctx.fillRect(x - 8, y - 4, 16, 10);
  // Outline
  ctx.strokeStyle = '#333345';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 8, y - 4, 16, 10);
  // Back
  ctx.fillStyle = '#3a3a4e';
  ctx.fillRect(x - 7, y - 9, 14, 6);
  ctx.strokeStyle = '#2a2a3e';
  ctx.strokeRect(x - 7, y - 9, 14, 6);
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(x - 7, y - 4, 14, 2);
}

// ===== SERVER ROOM =====
function drawServerRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const baseX = 470;

  for (let i = 0; i < 4; i++) {
    const rx = baseX + i * 110;
    const ry = 40;

    // Rack body with outline
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(rx, ry, 40, 180);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, 40, 180);
    // Top highlight
    ctx.fillStyle = '#3a3a4e';
    ctx.fillRect(rx + 1, ry + 1, 38, 3);

    // Server units
    for (let j = 0; j < 6; j++) {
      const uy = ry + 5 + j * 28;
      ctx.fillStyle = '#111118';
      ctx.fillRect(rx + 3, uy, 34, 22);
      ctx.strokeStyle = '#222230';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 3, uy, 34, 22);

      // LED — smooth pulsing instead of on/off blink
      const pulse = (Math.sin(frame * 0.03 + i * 1.5 + j * 0.8) + 1) / 2;
      const g = Math.floor(100 + pulse * 155);
      ctx.fillStyle = `rgb(0,${g},0)`;
      ctx.fillRect(rx + 32, uy + 3, 3, 3);
      // Second LED
      const isAlert = Math.sin(frame * 0.02 + i * 2.1) > 0.92;
      const bluePulse = (Math.sin(frame * 0.04 + i + j * 0.5) + 1) / 2;
      ctx.fillStyle = isAlert ? '#ef4444' : `rgba(59,130,246,${0.4 + bluePulse * 0.6})`;
      ctx.fillRect(rx + 32, uy + 10, 3, 3);

      // Vent lines
      ctx.fillStyle = '#1a1a28';
      for (let v = 0; v < 3; v++) {
        ctx.fillRect(rx + 5 + v * 8, uy + 16, 6, 1);
      }
    }

    // Shadow under rack
    drawShadow(ctx, rx + 20, ry + 182, 22, 4);
  }

  // Cables
  ctx.strokeStyle = '#4a4a6e33';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(baseX + i * 110 + 20, 220);
    ctx.bezierCurveTo(baseX + i * 110 + 30, 240, baseX + (i + 1) * 110 + 10, 240, baseX + (i + 1) * 110 + 20, 220);
    ctx.stroke();
  }

  // Temperature display
  ctx.fillStyle = '#111118';
  ctx.fillRect(900, 40, 45, 25);
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 1;
  ctx.strokeRect(900, 40, 45, 25);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('22°C', 922, 57);
}

// ===== MAIN OFFICE =====
function drawMainOfficeDesks(ctx: CanvasRenderingContext2D, frame: number, agents: AgentState[]) {
  // Plants
  drawPixelPlant(ctx, 50, 285, frame, 0);
  drawPixelPlant(ctx, 910, 285, frame, 100);
  drawPixelPlant(ctx, 50, 455, frame, 200);
  drawPixelPlant(ctx, 910, 455, frame, 300);

  // Printer with outline
  drawPixelPrinter(ctx, 920, 375);

  // Trash can with outline
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(30, 400, 16, 20);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 400, 16, 20);
  ctx.fillStyle = '#555';
  ctx.fillRect(28, 398, 20, 4);
  ctx.strokeRect(28, 398, 20, 4);

  for (const agent of agents) {
    const desk = DESK_LAYOUT[agent.desk];
    if (!desk) continue;
    drawPixelDesk(ctx, desk.x, desk.y, agent, frame);
  }
}

function drawPixelDesk(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  // Shadow under desk
  drawShadow(ctx, x, y + 40, 34, 5);

  // Desk surface with shading
  const deskDark = '#2a1f14';
  const deskBase = '#3d2b1f';
  const deskLight = '#5a4030';

  ctx.fillStyle = deskBase;
  ctx.fillRect(x - 32, y + 10, 64, 24);
  // Top edge highlight
  ctx.fillStyle = deskLight;
  ctx.fillRect(x - 32, y + 10, 64, 3);
  // Bottom shade
  ctx.fillStyle = deskDark;
  ctx.fillRect(x - 32, y + 31, 64, 3);
  // Outline
  ctx.strokeStyle = '#1a1208';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 32, y + 10, 64, 24);
  // Legs with shading
  ctx.fillStyle = deskDark;
  ctx.fillRect(x - 30, y + 34, 5, 10);
  ctx.fillRect(x + 25, y + 34, 5, 10);
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(x - 30, y + 34, 1, 10);
  ctx.fillRect(x + 29, y + 34, 1, 10);

  // Chair with outline + shading
  ctx.fillStyle = '#333350';
  ctx.fillRect(x - 10, y + 44, 20, 12);
  ctx.fillStyle = '#3d3d5a'; // highlight
  ctx.fillRect(x - 10, y + 44, 20, 2);
  ctx.fillStyle = '#2a2a40'; // back
  ctx.fillRect(x - 8, y + 38, 16, 8);
  ctx.strokeStyle = '#222238';
  ctx.strokeRect(x - 10, y + 44, 20, 12);
  ctx.strokeRect(x - 8, y + 38, 16, 8);

  // Monitor(s) with content
  if (agent.desk === 'dev') {
    drawPixelMonitor(ctx, x - 16, y - 6, agent.color, frame, 'code');
    drawPixelMonitor(ctx, x + 8, y - 6, agent.color, frame, 'code');
  } else if (agent.desk === 'trading') {
    drawPixelMonitor(ctx, x - 8, y - 6, agent.color, frame, 'chart');
    drawPixelMonitor(ctx, x + 16, y - 4, '#22c55e', frame, 'bars');
  } else if (agent.desk === 'design') {
    drawPixelMonitor(ctx, x - 8, y - 6, agent.color, frame, 'design');
  } else if (agent.desk === 'security') {
    drawPixelMonitor(ctx, x - 8, y - 6, agent.color, frame, 'terminal');
  } else {
    drawPixelMonitor(ctx, x - 8, y - 6, agent.color, frame, 'text');
  }

  // Keyboard with outline
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 12, y + 18, 24, 6);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 12, y + 18, 24, 6);
  ctx.fillStyle = '#2a2a2a';
  for (let kx = 0; kx < 5; kx++) {
    ctx.fillRect(x - 10 + kx * 5, y + 19, 3, 2);
    ctx.fillRect(x - 10 + kx * 5, y + 22, 3, 2);
  }

  // Desk items
  if (agent.desk === 'design') {
    // Tablet/easel
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(x + 36, y + 5, 3, 28);
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(x + 32, y, 14, 18);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(x + 32, y, 14, 18);
    ctx.fillStyle = '#ec489966';
    ctx.fillRect(x + 34, y + 3, 5, 5);
    ctx.fillStyle = '#3b82f644';
    ctx.fillRect(x + 36, y + 9, 7, 4);
  }
  if (agent.desk === 'research') {
    // Books stack
    ctx.fillStyle = '#8b4513'; ctx.fillRect(x + 28, y + 12, 18, 4);
    ctx.fillStyle = '#1e3a5f'; ctx.fillRect(x + 28, y + 8, 18, 4);
    ctx.fillStyle = '#5c1e1e'; ctx.fillRect(x + 28, y + 4, 18, 4);
    ctx.strokeStyle = '#00000033';
    ctx.strokeRect(x + 28, y + 4, 18, 12);
    // Papers
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(x - 32, y + 14, 12, 8);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(x - 30, y + 16, 8, 1);
    ctx.fillRect(x - 30, y + 18, 6, 1);
  }
  if (agent.desk === 'command') {
    // Extra monitor for command
    ctx.fillStyle = '#111118';
    ctx.fillRect(x + 30, y - 2, 14, 12);
    ctx.fillStyle = '#9333ea33';
    ctx.fillRect(x + 31, y - 1, 12, 10);
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 35, y + 10, 4, 3);
  }
}

function drawPixelMonitor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, frame: number, content: string) {
  // Monitor body with outline
  ctx.fillStyle = '#111118';
  ctx.fillRect(x, y, 20, 16);
  ctx.strokeStyle = '#222230';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, 20, 16);

  // Screen bezel highlight
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x + 1, y + 1, 18, 1);

  // Screen
  ctx.fillStyle = color + '33';
  ctx.fillRect(x + 2, y + 2, 16, 11);

  // Content
  if (content === 'code') {
    const scrollOff = (frame * 0.3) % 12;
    ctx.fillStyle = '#22c55e88';
    for (let line = 0; line < 4; line++) {
      const lw = 4 + ((line + Math.floor(scrollOff)) % 4) * 3;
      ctx.fillRect(x + 4, y + 3 + line * 3, lw, 1);
    }
  } else if (content === 'chart') {
    for (let i = 0; i < 5; i++) {
      const h = 3 + Math.sin(frame * 0.02 + i) * 3;
      const isGreen = Math.sin(frame * 0.03 + i * 1.5) > 0;
      ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
      ctx.fillRect(x + 3 + i * 3, y + 11 - h, 2, h);
    }
  } else if (content === 'bars') {
    for (let i = 0; i < 4; i++) {
      const h = 2 + Math.abs(Math.sin(frame * 0.015 + i * 0.8)) * 5;
      ctx.fillStyle = ['#3b82f6', '#22c55e', '#eab308', '#ef4444'][i];
      ctx.fillRect(x + 3 + i * 3.5, y + 11 - h, 2, h);
    }
  } else if (content === 'design') {
    // Colored rectangles (design mockup)
    ctx.fillStyle = '#ec489966';
    ctx.fillRect(x + 3, y + 3, 6, 4);
    ctx.fillStyle = '#3b82f666';
    ctx.fillRect(x + 10, y + 3, 6, 4);
    ctx.fillStyle = '#22c55e44';
    ctx.fillRect(x + 3, y + 8, 13, 3);
  } else if (content === 'terminal') {
    ctx.fillStyle = '#22c55e88';
    ctx.fillRect(x + 3, y + 3, 2, 1);
    ctx.fillRect(x + 6, y + 3, 8, 1);
    ctx.fillStyle = '#ef444466';
    ctx.fillRect(x + 3, y + 6, 10, 1);
    ctx.fillStyle = '#22c55e55';
    ctx.fillRect(x + 3, y + 9, 4, 1);
    // Cursor blink
    if (frame % 40 < 20) {
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x + 8, y + 9, 2, 1);
    }
  } else {
    // Generic text
    ctx.fillStyle = color + '55';
    for (let line = 0; line < 3; line++) {
      ctx.fillRect(x + 4, y + 3 + line * 3, 8 + (line % 2) * 3, 1);
    }
  }

  // Stand with outline
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 8, y + 14, 4, 4);
  ctx.fillRect(x + 5, y + 17, 10, 2);
  ctx.strokeStyle = '#222';
  ctx.strokeRect(x + 5, y + 17, 10, 2);
}

function drawPixelPrinter(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(x, y, 30, 18);
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, 30, 18);
  // Top highlight
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(x + 1, y + 1, 28, 3);
  ctx.fillStyle = '#ccc';
  ctx.fillRect(x + 2, y + 4, 26, 5);
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(x + 2, y + 10, 26, 6);
  // Paper
  ctx.fillStyle = '#f8f8f0';
  ctx.fillRect(x + 4, y - 4, 22, 6);
  ctx.strokeStyle = '#ddd';
  ctx.strokeRect(x + 4, y - 4, 22, 6);
  drawShadow(ctx, x + 15, y + 20, 16, 3);
}

// ===== KITCHEN =====
function drawKitchen(ctx: CanvasRenderingContext2D, frame: number) {
  const kx = 20, ky = 540;

  // Counter with outline + shading
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(kx, ky + 20, 260, 14);
  ctx.fillStyle = '#6a5040';
  ctx.fillRect(kx, ky + 20, 260, 3);
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(kx, ky + 31, 260, 3);
  ctx.strokeStyle = '#3a2818';
  ctx.lineWidth = 1;
  ctx.strokeRect(kx, ky + 20, 260, 14);

  // Coffee machine with outline
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(kx + 20, ky, 30, 24);
  ctx.strokeStyle = '#333';
  ctx.strokeRect(kx + 20, ky, 30, 24);
  ctx.fillStyle = '#555';
  ctx.fillRect(kx + 21, ky + 1, 28, 2);
  ctx.fillStyle = '#333';
  ctx.fillRect(kx + 22, ky + 4, 26, 10);

  // Cup
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(kx + 28, ky + 14, 10, 8);
  ctx.strokeStyle = '#ccc';
  ctx.strokeRect(kx + 28, ky + 14, 10, 8);
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(kx + 29, ky + 15, 8, 5);

  // Better steam
  for (let i = 0; i < 4; i++) {
    const sy = ky - 4 - i * 5 - Math.sin(frame * 0.06 + i) * 3;
    const sx = kx + 33 + Math.sin(frame * 0.04 + i * 1.8) * 3;
    const alpha = 0.35 - i * 0.07;
    ctx.fillStyle = `rgba(200,200,220,${alpha})`;
    ctx.fillRect(sx, sy, 2, 2);
    ctx.fillRect(sx + 1, sy - 2, 1, 2);
  }

  // Fridge with outline + shading
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(kx + 200, ky - 20, 40, 60);
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(kx + 201, ky - 19, 38, 3);
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.strokeRect(kx + 200, ky - 20, 40, 30);
  ctx.strokeRect(kx + 200, ky + 10, 40, 20);
  ctx.fillStyle = '#888';
  ctx.fillRect(kx + 236, ky - 5, 2, 10);
  ctx.fillRect(kx + 236, ky + 15, 2, 8);
  drawShadow(ctx, kx + 220, ky + 42, 22, 4);

  // Stools — spread out more
  const stoolPositions = [
    { x: kx + 55, y: ky + 48 },
    { x: kx + 115, y: ky + 48 },
    { x: kx + 175, y: ky + 48 },
  ];
  for (const s of stoolPositions) {
    ctx.fillStyle = '#4a4a5e';
    ctx.fillRect(s.x, s.y, 14, 6);
    ctx.strokeStyle = '#333345';
    ctx.strokeRect(s.x, s.y, 14, 6);
    ctx.fillStyle = '#3a3a4e';
    ctx.fillRect(s.x + 5, s.y + 6, 4, 10);
  }

  // Microwave on counter
  ctx.fillStyle = '#555';
  ctx.fillRect(kx + 100, ky + 4, 24, 16);
  ctx.strokeStyle = '#444';
  ctx.strokeRect(kx + 100, ky + 4, 24, 16);
  ctx.fillStyle = '#111';
  ctx.fillRect(kx + 102, ky + 6, 14, 12);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(kx + 118, ky + 8, 3, 2);
}

// ===== GAME ROOM =====
function drawGameRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const gx = 320, gy = 540;

  // Ping pong table with outline + shading
  ctx.fillStyle = '#1e5c3a';
  ctx.fillRect(gx + 100, gy + 20, 120, 60);
  ctx.fillStyle = '#24704a';
  ctx.fillRect(gx + 101, gy + 21, 118, 3);
  ctx.strokeStyle = '#0f3a20';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx + 100, gy + 20, 120, 60);
  // Net
  ctx.fillStyle = '#ffffff44';
  ctx.fillRect(gx + 158, gy + 20, 4, 60);
  // White edge line
  ctx.strokeStyle = '#ffffff66';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + 102, gy + 22, 116, 56);
  // Legs
  ctx.fillStyle = '#333';
  ctx.fillRect(gx + 104, gy + 80, 4, 8);
  ctx.fillRect(gx + 212, gy + 80, 4, 8);
  drawShadow(ctx, gx + 160, gy + 90, 60, 5);

  // Arcade cabinet with outline
  ctx.fillStyle = '#1a1a3e';
  ctx.fillRect(gx + 280, gy, 35, 60);
  ctx.strokeStyle = '#111128';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + 280, gy, 35, 60);
  // Top trim
  ctx.fillStyle = '#2a2a5e';
  ctx.fillRect(gx + 281, gy + 1, 33, 3);
  // Screen
  ctx.fillStyle = '#111';
  ctx.fillRect(gx + 283, gy + 5, 29, 22);
  const glowColor = `hsl(${(frame * 2) % 360}, 70%, 50%)`;
  ctx.fillStyle = glowColor + '55';
  ctx.fillRect(gx + 285, gy + 7, 25, 18);
  // Joystick
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(gx + 294, gy + 35, 5, 5);
  ctx.strokeStyle = '#aa2222';
  ctx.strokeRect(gx + 294, gy + 35, 5, 5);
  // Buttons
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(gx + 302, gy + 37, 4, 4);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(gx + 308, gy + 36, 4, 4);
  drawShadow(ctx, gx + 297, gy + 62, 18, 4);

  // Beanbag chairs with outlines — spread for sleeping agents
  const beanbagDefs = [
    { x: gx + 380, y: gy + 60, color: '#4a2060' },
    { x: gx + 460, y: gy + 70, color: '#203060' },
    { x: gx + 540, y: gy + 65, color: '#205030' },
    { x: gx + 390, y: gy + 110, color: '#503020' },
    { x: gx + 470, y: gy + 115, color: '#204050' },
    { x: gx + 550, y: gy + 110, color: '#402050' },
  ];
  for (const bb of beanbagDefs) {
    drawPixelBeanbag(ctx, bb.x, bb.y, bb.color);
  }

  // TV with outline
  ctx.fillStyle = '#111118';
  ctx.fillRect(gx + 400, gy - 10, 60, 35);
  ctx.strokeStyle = '#222230';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx + 400, gy - 10, 60, 35);
  // Screen content
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(gx + 403, gy - 7, 54, 29);
  // TV noise
  for (let i = 0; i < 15; i++) {
    const nx = gx + 405 + Math.floor(Math.random() * 50);
    const ny = gy - 5 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
    ctx.fillRect(nx, ny, 2, 2);
  }
  // TV stand
  ctx.fillStyle = '#333';
  ctx.fillRect(gx + 425, gy + 25, 10, 4);
}

function drawPixelBeanbag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  drawShadow(ctx, x, y + 14, 20, 5);
  // Main body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Outline
  ctx.strokeStyle = darkenColor(color, 0.4);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, 18, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Top highlight
  ctx.fillStyle = lightenColor(color, 0.3) + '44';
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ===== PLANT =====
function drawPixelPlant(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, offset: number) {
  const sway = Math.sin(frame * 0.012 + offset * 0.01) * 1.5;
  drawShadow(ctx, x + 8, y + 30, 10, 3);
  // Pot
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x, y + 16, 16, 12);
  ctx.fillStyle = '#a0522d';
  ctx.fillRect(x - 2, y + 14, 20, 4);
  ctx.strokeStyle = '#6b3410';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y + 16, 16, 12);
  // Soil
  ctx.fillStyle = '#3a2210';
  ctx.fillRect(x + 2, y + 15, 12, 3);
  // Stem
  ctx.fillStyle = '#166534';
  ctx.fillRect(x + 7, y + 4, 3, 12);
  // Leaves
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x + 2 + sway, y - 1, 12, 5);
  ctx.fillRect(x - 2 + sway, y + 3, 7, 4);
  ctx.fillRect(x + 11 + sway, y + 2, 7, 4);
  // Leaf highlights
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(x + 4 + sway, y, 4, 2);
  ctx.fillRect(x + 12 + sway, y + 3, 3, 2);
  // Dark leaf areas
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(x + 2 + sway, y + 2, 3, 3);
}

// ===== CLOCK =====
function drawClock(ctx: CanvasRenderingContext2D) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Sydney' });

  ctx.fillStyle = '#111118';
  ctx.fillRect(380, 268, 50, 18);
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 1;
  ctx.strokeRect(380, 268, 50, 18);
  ctx.fillStyle = '#e0e0e0';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(timeStr, 405, 281);
}

// ===== DAY/NIGHT =====
function drawDayNightOverlay(ctx: CanvasRenderingContext2D) {
  const now = new Date();
  const aestHour = (now.getUTCHours() + 10) % 24;

  if (aestHour >= 22 || aestHour < 6) {
    ctx.fillStyle = 'rgba(0,0,20,0.25)';
    ctx.fillRect(0, 0, W, H);
    const lamps = [
      { x: 100, y: 300 }, { x: 380, y: 300 }, { x: 660, y: 300 },
    ];
    for (const lamp of lamps) {
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 5, lamp.x, lamp.y, 60);
      grad.addColorStop(0, 'rgba(255,200,100,0.12)');
      grad.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lamp.x - 60, lamp.y - 60, 120, 120);
    }
  } else if (aestHour >= 18 || aestHour < 7) {
    ctx.fillStyle = 'rgba(0,0,20,0.1)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ===== AMBIENT =====
function drawAmbient(ctx: CanvasRenderingContext2D, frame: number) {
  // Glass reflection pulse in meeting room
  if (frame % 180 < 90) {
    ctx.fillStyle = 'rgba(99,102,241,0.015)';
    ctx.fillRect(2, 2, 436, 256);
  }
}

// ===== 48x48 AGENT SPRITES — PROPER PIXEL ART =====

function drawAgent48(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  agent: AgentState,
  anim: AnimAgent,
  frame: number
) {
  const { state } = anim;
  const f = frame + anim.idleOffset; // staggered idle

  if (state === 'sleeping') { drawSleepingAgent(ctx, x, y, agent, f); return; }
  if (state === 'walking') { drawWalkingAgent(ctx, x, y, agent, anim, f); return; }
  if (state === 'coffee') { drawCoffeeAgent(ctx, x, y, agent, f); return; }
  if (state === 'meeting') { drawMeetingAgent(ctx, x, y, agent, f); return; }
  if (state === 'sitting') { drawSittingAgent(ctx, x, y, agent, f); return; }
  drawStandingAgent(ctx, x, y, agent, f);
}

// ===== PIXEL ART CHARACTER PARTS =====

// Skin colors: 3 shades
const SKIN_BASE = '#f0d0a0';
const SKIN_LIGHT = '#ffe0b8';
const SKIN_DARK = '#d0a870';
const OUTLINE = '#1a1018'; // dark outline for all characters

function drawPixelHead(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number, lookDir: number) {
  const hw = 14, hh = 14; // head is ~40% of 48px height — chibi style

  // Head outline
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - hw/2 - 1, y - 1, hw + 2, hh + 2);

  // Head fill
  ctx.fillStyle = SKIN_BASE;
  ctx.fillRect(x - hw/2, y, hw, hh);

  // Shading on right side
  ctx.fillStyle = SKIN_DARK;
  ctx.fillRect(x + hw/2 - 3, y + 1, 3, hh - 2);

  // Highlight on left
  ctx.fillStyle = SKIN_LIGHT;
  ctx.fillRect(x - hw/2, y + 1, 2, 4);

  // Hair — unique per agent using color
  drawHair(ctx, x, y, agent, hw, hh);

  // Eyes — 3x2 pixels with highlight
  const blink = frame % 200 < 4;
  const eyeY = y + 6;
  const eyeOffset = lookDir * 1;

  if (!blink) {
    // Left eye
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 4 + eyeOffset, eyeY, 3, 3);
    // Right eye
    ctx.fillRect(x + 2 + eyeOffset, eyeY, 3, 3);
    // Eye highlights (life!)
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 3 + eyeOffset, eyeY, 1, 1);
    ctx.fillRect(x + 3 + eyeOffset, eyeY, 1, 1);
  } else {
    // Blink — thin line
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 4 + eyeOffset, eyeY + 1, 3, 1);
    ctx.fillRect(x + 2 + eyeOffset, eyeY + 1, 3, 1);
  }
}

function drawHair(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, hw: number, hh: number) {
  const hairDark = darkenColor(agent.color, 0.5);
  const hairBase = darkenColor(agent.color, 0.3);
  const hairLight = darkenColor(agent.color, 0.1);

  // Different hairstyles per agent
  switch (agent.id) {
    case 'main': // Spock — swept back, distinguished
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 1, y - 4, hw + 2, 7);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2, y - 3, hw, 5);
      ctx.fillStyle = hairLight;
      ctx.fillRect(x - hw/2 + 2, y - 3, 4, 2);
      break;
    case 'dev': // Scotty — messy/spiky
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 1, y - 4, hw + 2, 6);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2, y - 3, hw, 4);
      // Spikes
      ctx.fillStyle = hairLight;
      ctx.fillRect(x - 5, y - 6, 3, 3);
      ctx.fillRect(x + 1, y - 7, 3, 4);
      ctx.fillRect(x - 2, y - 5, 3, 2);
      break;
    case 'trader': // Gordon — slicked
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 1, y - 3, hw + 3, 5);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2, y - 2, hw, 3);
      // Side part
      ctx.fillStyle = hairLight;
      ctx.fillRect(x - hw/2 + 1, y - 2, 3, 1);
      break;
    case 'research': // Watson — curly/bushy
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 2, y - 5, hw + 4, 8);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2 - 1, y - 4, hw + 2, 6);
      ctx.fillStyle = hairLight;
      ctx.fillRect(x - 3, y - 4, 2, 2);
      ctx.fillRect(x + 2, y - 3, 2, 2);
      break;
    case 'creative': // Nova — long, flowing
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 1, y - 4, hw + 2, 6);
      ctx.fillRect(x - hw/2 - 2, y, 3, 10); // left side
      ctx.fillRect(x + hw/2, y, 3, 10); // right side
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2, y - 3, hw, 4);
      ctx.fillStyle = hairLight;
      ctx.fillRect(x - 2, y - 3, 5, 2);
      break;
    case 'audit': // Cipher — buzzcut/military
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2, y - 2, hw, 4);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2 + 1, y - 1, hw - 2, 2);
      break;
    case 'social': // Oscar — wavy
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 1, y - 4, hw + 2, 6);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2, y - 3, hw, 4);
      // Wave bumps
      ctx.fillStyle = hairLight;
      ctx.fillRect(x - 5, y - 5, 4, 2);
      ctx.fillRect(x + 2, y - 5, 4, 2);
      break;
    case 'growth': // Rex — flat top
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 1, y - 5, hw + 2, 3);
      ctx.fillRect(x - hw/2, y - 2, hw, 4);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2, y - 4, hw, 2);
      break;
    case 'rook': // Rook — mohawk-ish
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - 3, y - 7, 6, 4);
      ctx.fillRect(x - hw/2, y - 3, hw, 5);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - 2, y - 6, 4, 3);
      ctx.fillStyle = hairLight;
      ctx.fillRect(x - 1, y - 6, 2, 2);
      break;
    case 'pm': // Atlas — neat side part
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 1, y - 3, hw + 2, 5);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2, y - 2, hw, 3);
      // Part line
      ctx.fillStyle = SKIN_DARK;
      ctx.fillRect(x - 2, y - 2, 1, 3);
      ctx.fillStyle = hairLight;
      ctx.fillRect(x + 1, y - 2, 4, 1);
      break;
    case 'finance': // Ledger — receding/professional
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2, y - 2, hw, 4);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2 + 2, y - 1, hw - 4, 2);
      break;
    default:
      ctx.fillStyle = hairDark;
      ctx.fillRect(x - hw/2 - 1, y - 4, hw + 2, 6);
      ctx.fillStyle = hairBase;
      ctx.fillRect(x - hw/2, y - 3, hw, 4);
  }
}

function drawPixelBody(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState) {
  const color = agent.color;
  const dark = darkenColor(color, 0.3);
  const light = lightenColor(color, 0.2);

  // Body outline
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 8, y - 1, 16, 16);

  // Body fill
  ctx.fillStyle = color;
  ctx.fillRect(x - 7, y, 14, 14);

  // Shading — right side darker
  ctx.fillStyle = dark;
  ctx.fillRect(x + 4, y + 1, 3, 12);

  // Highlight — left top
  ctx.fillStyle = light;
  ctx.fillRect(x - 7, y, 3, 4);

  // Collar detail
  ctx.fillStyle = light;
  ctx.fillRect(x - 3, y, 6, 2);
}

function drawPixelLegs(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Pants
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 6, y - 1, 5, 11);
  ctx.fillRect(x + 1, y - 1, 5, 11);

  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x - 5, y, 4, 10);
  ctx.fillRect(x + 2, y, 4, 10);

  // Shading
  ctx.fillStyle = '#1e1e30';
  ctx.fillRect(x - 2, y, 1, 10); // gap shadow
  ctx.fillRect(x + 5, y + 2, 1, 6); // right shade

  // Shoes
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 7, y + 9, 6, 4);
  ctx.fillRect(x + 1, y + 9, 6, 4);
  ctx.fillStyle = '#333348';
  ctx.fillRect(x - 6, y + 10, 5, 2);
  ctx.fillRect(x + 2, y + 10, 5, 2);
  // Shoe highlight
  ctx.fillStyle = '#444460';
  ctx.fillRect(x - 6, y + 10, 3, 1);
  ctx.fillRect(x + 2, y + 10, 3, 1);
}

function drawPixelArms(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, leftDy: number, rightDy: number) {
  const color = agent.color;
  const dark = darkenColor(color, 0.3);

  // Left arm outline + fill
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 13, y + leftDy - 1, 6, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x - 12, y + leftDy, 4, 10);
  ctx.fillStyle = dark;
  ctx.fillRect(x - 9, y + leftDy + 2, 1, 6);
  // Hand
  ctx.fillStyle = SKIN_BASE;
  ctx.fillRect(x - 12, y + leftDy + 9, 4, 3);

  // Right arm
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x + 7, y + rightDy - 1, 6, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x + 8, y + rightDy, 4, 10);
  ctx.fillStyle = dark;
  ctx.fillRect(x + 11, y + rightDy + 2, 1, 6);
  // Hand
  ctx.fillStyle = SKIN_BASE;
  ctx.fillRect(x + 8, y + rightDy + 9, 4, 3);
}

// ===== POSE DRAWS =====

function drawSittingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const bob = agent.status === 'active' ? Math.sin(frame * 0.08) * 1 : Math.sin(frame * 0.02) * 0.3;
  const dy = y - 20 + bob;

  drawPixelBody(ctx, x, dy + 6, agent);
  drawPixelHead(ctx, x, dy - 8, agent, frame, 0);

  // Arms on keyboard
  const color = agent.color;
  if (agent.status === 'active') {
    const armBob = Math.sin(frame * 0.15) > 0 ? 1 : -1;
    drawPixelArms(ctx, x, dy + 4, agent, armBob, -armBob);
  } else {
    drawPixelArms(ctx, x, dy + 4, agent, 0, 0);
  }

  drawAccessory(ctx, x, dy - 2, agent, frame);
  drawStatusDot(ctx, x + 9, dy - 9, agent.status, frame);
  drawAgentName(ctx, x, y + 28, agent.name, agent.status);

  if (agent.status === 'active' && agent.currentTask) {
    drawSpeechBubble(ctx, x, dy - 22, agent.currentTask.substring(0, 28));
  }
}

function drawStandingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const shift = Math.sin(frame * 0.025) * 0.8;
  const dx = x + shift;

  drawPixelLegs(ctx, dx, y + 18);
  drawPixelBody(ctx, dx, y + 4, agent);
  drawPixelHead(ctx, dx, y - 10, agent, frame, 0);
  drawPixelArms(ctx, dx, y + 2, agent, 0, 0);

  drawAccessory(ctx, dx, y - 4, agent, frame);
  drawStatusDot(ctx, dx + 9, y - 11, agent.status, frame);
  drawAgentName(ctx, x, y + 34, agent.name, agent.status);
}

function drawWalkingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, anim: AnimAgent, frame: number) {
  // Walk cycle with ease
  const walkPhase = (anim.walkFrame % 40) / 40;
  const legSwing = Math.sin(walkPhase * Math.PI * 2) * 4;
  const armSwing = Math.sin(walkPhase * Math.PI * 2) * 3;
  const headBob = Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 1.5;
  const lookDir = anim.targetX > anim.x ? 1 : -1;

  const dy = y - headBob;

  // Legs with swing
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 6, y + 17 - Math.max(0, legSwing), 5, 10 + Math.max(0, legSwing));
  ctx.fillRect(x + 1, y + 17 + Math.max(0, -legSwing), 5, 10 - Math.max(0, -legSwing));
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x - 5, y + 18 - Math.max(0, legSwing), 4, 8 + Math.max(0, legSwing));
  ctx.fillRect(x + 2, y + 18 + Math.max(0, -legSwing), 4, 8 - Math.max(0, -legSwing));

  // Shoes
  ctx.fillStyle = '#333348';
  ctx.fillRect(x - 7, y + 26, 6, 3);
  ctx.fillRect(x + 1, y + 26, 6, 3);

  drawPixelBody(ctx, x, dy + 4, agent);
  drawPixelHead(ctx, x, dy - 10, agent, frame, lookDir);

  // Arms swinging
  drawPixelArms(ctx, x, dy + 2, agent, -armSwing, armSwing);

  drawAccessory(ctx, x, dy - 4, agent, frame);
  drawAgentName(ctx, x, y + 34, agent.name, agent.status);
}

function drawSleepingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const breathe = Math.sin(frame * 0.03) * 0.5;

  // Body horizontal with outline
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 13, y - 1 + breathe, 26, 12);
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 12, y + breathe, 24, 10);
  ctx.fillStyle = darkenColor(agent.color, 0.3);
  ctx.fillRect(x - 12, y + 7 + breathe, 24, 3);

  // Head to the side with outline
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 18, y - 5 + breathe, 12, 11);
  ctx.fillStyle = SKIN_BASE;
  ctx.fillRect(x - 17, y - 4 + breathe, 10, 9);
  ctx.fillStyle = SKIN_DARK;
  ctx.fillRect(x - 9, y - 3 + breathe, 2, 7);

  // Closed eyes
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 15, y + breathe, 3, 1);
  ctx.fillRect(x - 11, y + breathe, 3, 1);

  // Hair
  const hairDark = darkenColor(agent.color, 0.5);
  ctx.fillStyle = hairDark;
  ctx.fillRect(x - 18, y - 7 + breathe, 12, 4);

  // Legs tucked with outline
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x + 7, y + 3 + breathe, 10, 6);
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x + 8, y + 4 + breathe, 8, 4);

  // ZZZ with float
  const zFloat = Math.sin(frame * 0.04) * 3;
  ctx.fillStyle = '#9ca3af55';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('z', x - 12, y - 10 + zFloat);
  ctx.font = '10px monospace';
  ctx.fillText('z', x - 7, y - 18 + zFloat * 0.7);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#9ca3af44';
  ctx.fillText('Z', x - 2, y - 26 + zFloat * 0.5);

  // Name
  ctx.fillStyle = '#4b5563';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, x, y + 20);
}

function drawCoffeeAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const shift = Math.sin(frame * 0.02) * 0.4;

  drawPixelLegs(ctx, x, y + 18);
  drawPixelBody(ctx, x, y + 4 + shift, agent);
  drawPixelHead(ctx, x, y - 10 + shift, agent, frame, 0);

  // Mouth (smile)
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 2, y - 2 + shift, 4, 1);

  // Left arm down
  const color = agent.color;
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x - 13, y + 5 + shift, 6, 12);
  ctx.fillStyle = color;
  ctx.fillRect(x - 12, y + 6 + shift, 4, 10);

  // Right arm holding mug
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x + 7, y + 3 + shift, 6, 10);
  ctx.fillStyle = color;
  ctx.fillRect(x + 8, y + 4 + shift, 4, 8);

  // Coffee mug with outline
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x + 11, y + 5 + shift, 9, 9);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(x + 12, y + 6 + shift, 7, 7);
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(x + 13, y + 7 + shift, 5, 4);
  // Handle
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(x + 19, y + 7 + shift, 2, 2);
  ctx.fillRect(x + 20, y + 9 + shift, 2, 2);
  ctx.fillRect(x + 19, y + 10 + shift, 2, 2);

  // Steam
  for (let i = 0; i < 3; i++) {
    const sy = y + 1 - i * 5 + shift - Math.sin(frame * 0.05 + i) * 2;
    const sx = x + 15 + Math.sin(frame * 0.03 + i * 1.5) * 2;
    ctx.fillStyle = `rgba(200,200,220,${0.3 - i * 0.08})`;
    ctx.fillRect(sx, sy, 2, 2);
  }

  drawSpeechBubble(ctx, x, y - 24, '☕ break');
  drawAccessory(ctx, x, y - 4 + shift, agent, frame);
  drawAgentName(ctx, x, y + 34, agent.name, agent.status);
}

function drawMeetingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const gesturing = Math.sin(frame * 0.06 + x * 0.1) > 0.6;
  const bob = Math.sin(frame * 0.035) * 0.4;
  const dy = y + bob;

  // Legs under table
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x - 5, dy + 16, 4, 6);
  ctx.fillRect(x + 1, dy + 16, 4, 6);

  drawPixelBody(ctx, x, dy + 4, agent);
  drawPixelHead(ctx, x, dy - 8, agent, frame, 0);

  // Arms
  if (gesturing) {
    // Raised arm
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(x - 15, dy, 6, 10);
    ctx.fillStyle = agent.color;
    ctx.fillRect(x - 14, dy + 1, 4, 8);
    ctx.fillStyle = SKIN_BASE;
    ctx.fillRect(x - 14, dy - 1, 4, 3);
    // Other arm
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(x + 7, dy + 5, 6, 10);
    ctx.fillStyle = agent.color;
    ctx.fillRect(x + 8, dy + 6, 4, 8);
  } else {
    drawPixelArms(ctx, x, dy + 2, agent, 0, 0);
  }

  drawAccessory(ctx, x, dy - 2, agent, frame);
  drawStatusDot(ctx, x + 9, dy - 9, agent.status, frame);
  drawAgentName(ctx, x, y + 30, agent.name, agent.status);
}

// ===== ACCESSORIES — with outlines and detail =====

function drawAccessory(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const acc = agent.accessory;
  const color = agent.color;

  switch (acc) {
    case 'crown': {
      // Proper pixel crown
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 7, y - 14, 15, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x - 6, y - 10, 12, 4);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x - 6, y - 12, 12, 2);
      // Points
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x - 7, y - 15, 3, 5);
      ctx.fillRect(x - 1, y - 16, 3, 6);
      ctx.fillRect(x + 5, y - 15, 3, 5);
      // Gems
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x - 1, y - 13, 2, 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(x - 5, y - 11, 2, 2);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x + 4, y - 11, 2, 2);
      break;
    }
    case 'glasses': {
      // Thick pixel glasses
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 6, y - 5, 6, 5);
      ctx.fillRect(x + 1, y - 5, 6, 5);
      ctx.fillRect(x, y - 3, 1, 2);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x - 5, y - 4, 4, 3);
      ctx.fillRect(x + 2, y - 4, 4, 3);
      // Lens shine
      ctx.fillStyle = '#94a3b833';
      ctx.fillRect(x - 4, y - 4, 2, 1);
      ctx.fillRect(x + 3, y - 4, 2, 1);
      break;
    }
    case 'hat': {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 9, y - 9, 18, 4);
      ctx.fillRect(x - 6, y - 15, 12, 7);
      ctx.fillStyle = color;
      ctx.fillRect(x - 8, y - 8, 16, 2);
      ctx.fillRect(x - 5, y - 14, 10, 6);
      ctx.fillStyle = lightenColor(color, 0.3);
      ctx.fillRect(x - 5, y - 14, 10, 2);
      break;
    }
    case 'badge': {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 10, y + 4, 8, 7);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x - 9, y + 5, 6, 5);
      // Star on badge
      ctx.fillStyle = '#111';
      ctx.fillRect(x - 7, y + 6, 2, 2);
      break;
    }
    case 'headphones': {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 9, y - 6, 4, 9);
      ctx.fillRect(x + 6, y - 6, 4, 9);
      ctx.fillRect(x - 8, y - 10, 16, 4);
      ctx.fillStyle = '#444';
      ctx.fillRect(x - 8, y - 5, 3, 7);
      ctx.fillRect(x + 6, y - 5, 3, 7);
      ctx.fillStyle = '#555';
      ctx.fillRect(x - 7, y - 9, 14, 2);
      // Padding
      ctx.fillStyle = '#666';
      ctx.fillRect(x - 9, y - 3, 4, 4);
      ctx.fillRect(x + 6, y - 3, 4, 4);
      break;
    }
    case 'scarf': {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 9, y + 3, 18, 5);
      ctx.fillRect(x - 10, y + 8, 5, 7);
      ctx.fillStyle = color;
      ctx.fillRect(x - 8, y + 4, 16, 3);
      ctx.fillRect(x - 9, y + 9, 3, 5);
      ctx.fillStyle = darkenColor(color, 0.3);
      ctx.fillRect(x - 8, y + 5, 16, 1);
      ctx.fillStyle = lightenColor(color, 0.3);
      ctx.fillRect(x - 8, y + 4, 8, 1);
      break;
    }
    case 'cap': {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 7, y - 11, 14, 5);
      ctx.fillRect(x + 4, y - 10, 8, 4);
      ctx.fillStyle = color;
      ctx.fillRect(x - 6, y - 10, 12, 3);
      ctx.fillRect(x + 5, y - 9, 6, 2);
      ctx.fillStyle = lightenColor(color, 0.3);
      ctx.fillRect(x - 6, y - 10, 6, 1);
      break;
    }
    case 'bowtie': {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 7, y + 1, 14, 7);
      ctx.fillStyle = '#ec4899';
      // Left triangle
      ctx.fillRect(x - 6, y + 2, 5, 5);
      // Right triangle
      ctx.fillRect(x + 1, y + 2, 5, 5);
      // Center knot
      ctx.fillStyle = darkenColor('#ec4899', 0.3);
      ctx.fillRect(x - 1, y + 3, 2, 3);
      break;
    }
    case 'visor': {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 7, y - 5, 14, 5);
      ctx.fillStyle = '#22c55e66';
      ctx.fillRect(x - 6, y - 4, 12, 3);
      ctx.fillStyle = '#22c55e33';
      ctx.fillRect(x - 5, y - 3, 10, 1);
      break;
    }
    case 'antenna': {
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(x, y - 16, 2, 8);
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(x - 1, y - 19, 4, 4);
      // Pulsing red
      const pulse = (Math.sin(frame * 0.08) + 1) / 2;
      ctx.fillStyle = `rgba(239,68,68,${0.5 + pulse * 0.5})`;
      ctx.fillRect(x, y - 18, 2, 2);
      break;
    }
    case 'monocle': {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + 3, y - 1, 4, 0, Math.PI * 2);
      ctx.stroke();
      // Chain
      ctx.strokeStyle = '#fbbf2466';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 1);
      ctx.lineTo(x + 9, y + 8);
      ctx.stroke();
      // Glass shine
      ctx.fillStyle = '#fbbf2422';
      ctx.beginPath();
      ctx.arc(x + 3, y - 1, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

// ===== SPEECH BUBBLE =====
function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  const w = Math.min(text.length * 5 + 14, 150);
  const bx = x - w / 2;
  const by = y - 14;

  ctx.fillStyle = '#1a1a2eDD';
  ctx.strokeStyle = '#4a4a6e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, 14, 3);
  ctx.fill();
  ctx.stroke();

  // Pointer
  ctx.fillStyle = '#1a1a2eDD';
  ctx.beginPath();
  ctx.moveTo(x - 3, by + 14);
  ctx.lineTo(x, by + 18);
  ctx.lineTo(x + 3, by + 14);
  ctx.fill();

  ctx.fillStyle = '#d0d0d0';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, by + 10);
}

// ===== STATUS DOT =====
function drawStatusDot(ctx: CanvasRenderingContext2D, x: number, y: number, status: string, frame: number) {
  const color = status === 'active' ? '#22c55e' : status === 'idle' ? '#eab308' : '#4b5563';

  // Outer glow for active
  if (status === 'active') {
    const pulse = (Math.sin(frame * 0.06) + 1) / 2;
    ctx.fillStyle = `rgba(34,197,94,${0.1 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outline
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x - 1, y - 2, 2, 1);
}

// ===== AGENT NAME =====
function drawAgentName(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, status: string) {
  // Background pill
  const w = name.length * 5.5 + 6;
  ctx.fillStyle = 'rgba(10,10,15,0.6)';
  ctx.beginPath();
  ctx.roundRect(x - w/2, y - 7, w, 10, 3);
  ctx.fill();

  ctx.fillStyle = status === 'offline' ? '#4b5563' : '#d0d0d0';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name, x, y);
}
