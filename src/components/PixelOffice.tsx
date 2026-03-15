'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { AgentState, RoomId } from '@/lib/agents';

// ===== CANVAS DIMENSIONS =====
const W = 960;
const H = 720;

// ===== ROOM LAYOUT =====
// All rooms defined by pixel boundaries
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

// ===== DESK POSITIONS (within main office room) =====
// Top row: 6 desks, bottom row: 5 desks
const DESK_LAYOUT: Record<string, { x: number; y: number; row: number }> = {
  command:     { x: 100, y: 310, row: 0 },  // Spock
  dev:         { x: 240, y: 310, row: 0 },  // Scotty
  trading:     { x: 380, y: 310, row: 0 },  // Gordon
  research:    { x: 520, y: 310, row: 0 },  // Watson
  design:      { x: 660, y: 310, row: 0 },  // Nova
  security:    { x: 800, y: 310, row: 0 },  // Cipher
  content:     { x: 160, y: 420, row: 1 },  // Oscar
  strategy:    { x: 320, y: 420, row: 1 },  // Rex
  engineering: { x: 480, y: 420, row: 1 },  // Rook
  pm:          { x: 640, y: 420, row: 1 },  // Atlas
  finance:     { x: 800, y: 420, row: 1 },  // Ledger
};

// Positions for agents in other rooms
const KITCHEN_SPOTS = [
  { x: 80, y: 600 }, { x: 160, y: 610 }, { x: 230, y: 590 },
];

const GAME_ROOM_SPOTS = [
  { x: 500, y: 600 }, { x: 620, y: 610 }, { x: 740, y: 590 },
  { x: 440, y: 640 }, { x: 560, y: 650 },
];

const BEANBAG_SPOTS = [
  { x: 780, y: 640 }, { x: 850, y: 650 }, { x: 710, y: 660 },
];

const MEETING_SPOTS = [
  { x: 120, y: 100 }, { x: 200, y: 80 }, { x: 280, y: 100 },
  { x: 120, y: 160 }, { x: 200, y: 180 }, { x: 280, y: 160 },
];

// ===== DOORWAY POSITIONS =====
const DOORWAYS = [
  { x: 200, y: 250, w: 60, h: 20 },   // meeting → main
  { x: 460, y: 250, w: 60, h: 20 },   // meeting/server border
  { x: 700, y: 250, w: 60, h: 20 },   // server → main
  { x: 130, y: 510, w: 60, h: 20 },   // main → kitchen
  { x: 450, y: 510, w: 80, h: 20 },   // main → game room
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
}

interface PixelOfficeProps {
  agents: AgentState[];
}

export default function PixelOffice({ agents }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);
  const agentAnimRef = useRef<Map<string, AnimAgent>>(new Map());
  const spriteCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const prevAgentsRef = useRef<AgentState[]>([]);

  // Assign positions to agents in each room
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

  // Update animation targets when agent data changes
  useEffect(() => {
    const animMap = agentAnimRef.current;

    for (const agent of agents) {
      const target = getTargetPosition(agent, agents);
      let anim = animMap.get(agent.id);

      if (!anim) {
        // New agent — place at target immediately
        anim = {
          id: agent.id,
          x: target.x,
          y: target.y,
          targetX: target.x,
          targetY: target.y,
          room: agent.room,
          targetRoom: agent.room,
          walkFrame: 0,
          state: target.state,
          gestureFrame: 0,
        };
        animMap.set(agent.id, anim);
      } else {
        // Existing agent — update targets
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

    // ===== DRAW ROOMS =====
    for (const room of ROOMS) {
      drawRoomFloor(ctx, room);
    }

    // Room walls/borders
    drawWalls(ctx);

    // Doorways
    drawDoorways(ctx);

    // Room labels
    for (const room of ROOMS) {
      drawRoomLabel(ctx, room);
    }

    // ===== DRAW FURNITURE =====
    drawMeetingRoom(ctx, frame);
    drawServerRoom(ctx, frame);
    drawMainOfficeDesks(ctx, frame, agents);
    drawKitchen(ctx, frame);
    drawGameRoom(ctx, frame);

    // Day/night cycle
    drawDayNightOverlay(ctx);

    // Clock
    drawClock(ctx);

    // ===== UPDATE + DRAW AGENTS =====
    const animMap = agentAnimRef.current;
    const sortedAgents = [...agents].sort((a, b) => {
      const aa = animMap.get(a.id);
      const ab = animMap.get(b.id);
      return (aa?.y || 0) - (ab?.y || 0);
    });

    for (const agent of sortedAgents) {
      const anim = animMap.get(agent.id);
      if (!anim) continue;

      // Move towards target
      const dx = anim.targetX - anim.x;
      const dy = anim.targetY - anim.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        const speed = 1.8;
        anim.x += (dx / dist) * speed;
        anim.y += (dy / dist) * speed;
        anim.walkFrame++;
        anim.state = 'walking';
      } else {
        anim.x = anim.targetX;
        anim.y = anim.targetY;
        anim.room = anim.targetRoom;
        // State set by getTargetPosition
        const target = getTargetPosition(agent, agents);
        anim.state = target.state;
      }

      anim.gestureFrame = frame;
      drawAgent48(ctx, anim.x, anim.y, agent, anim, frame);
    }

    // Ambient effects
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

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
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

// ===== ROOM DRAWING =====

function drawRoomFloor(ctx: CanvasRenderingContext2D, room: RoomDef) {
  const { x, y, w, h, floorColor1, floorColor2, tileSize } = room;
  for (let tx = x; tx < x + w; tx += tileSize) {
    for (let ty = y; ty < y + h; ty += tileSize) {
      const col = Math.floor((tx - x) / tileSize);
      const row = Math.floor((ty - y) / tileSize);
      const isLight = (col + row) % 2 === 0;
      ctx.fillStyle = isLight ? floorColor1 : floorColor2;
      ctx.fillRect(tx, ty, tileSize, tileSize);
    }
  }
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 3;

  // Outer border
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Horizontal dividers
  ctx.beginPath();
  // meeting/server bottom → main top
  ctx.moveTo(0, 260); ctx.lineTo(W, 260);
  // main bottom → kitchen/game
  ctx.moveTo(0, 520); ctx.lineTo(W, 520);
  ctx.stroke();

  // Vertical dividers
  ctx.beginPath();
  // meeting | server
  ctx.moveTo(440, 0); ctx.lineTo(440, 260);
  // kitchen | game
  ctx.moveTo(300, 520); ctx.lineTo(300, H);
  ctx.stroke();

  // Glass wall effect for meeting room
  ctx.strokeStyle = '#6366f122';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 432, 252);
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 3;
}

function drawDoorways(ctx: CanvasRenderingContext2D) {
  for (const door of DOORWAYS) {
    // Clear the wall segment where the door is
    ctx.fillStyle = '#1e1e35';
    ctx.fillRect(door.x, door.y, door.w, door.h);
    // Door frame marks
    ctx.fillStyle = '#4a4a6e';
    ctx.fillRect(door.x - 2, door.y, 4, door.h);
    ctx.fillRect(door.x + door.w - 2, door.y, 4, door.h);
  }
}

function drawRoomLabel(ctx: CanvasRenderingContext2D, room: RoomDef) {
  ctx.fillStyle = '#6b728088';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${room.emoji} ${room.label}`, room.x + 10, room.y + 18);
}

// ===== MEETING ROOM FURNITURE =====

function drawMeetingRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const rx = 60, ry = 80;

  // Oval table
  ctx.fillStyle = '#3d321e';
  ctx.beginPath();
  ctx.ellipse(210, 130, 100, 45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a3e28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(210, 130, 100, 45, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Table surface highlight
  ctx.fillStyle = '#4a3e2844';
  ctx.beginPath();
  ctx.ellipse(210, 125, 80, 35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Chairs around table
  const chairPositions = [
    { x: 110, y: 100 }, { x: 210, y: 75 }, { x: 310, y: 100 },
    { x: 110, y: 160 }, { x: 210, y: 185 }, { x: 310, y: 160 },
  ];
  for (const c of chairPositions) {
    drawChair(ctx, c.x, c.y);
  }

  // Whiteboard on wall
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(20, 30, 120, 60);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 30, 120, 60);
  // Whiteboard text
  ctx.fillStyle = '#333';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Current Sprint:', 28, 50);
  ctx.fillStyle = '#2563eb';
  ctx.fillText('Office Upgrade v2', 28, 65);
  // Markers
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(26, 80, 8, 3);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(38, 80, 8, 3);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(50, 80, 8, 3);
}

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#4a4a5e';
  ctx.fillRect(x - 8, y - 4, 16, 12);
  ctx.fillStyle = '#3a3a4e';
  ctx.fillRect(x - 7, y - 8, 14, 5);
}

// ===== SERVER ROOM =====

function drawServerRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const baseX = 470;

  // Server racks
  for (let i = 0; i < 4; i++) {
    const rx = baseX + i * 110;
    const ry = 40;

    // Rack body
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(rx, ry, 40, 180);
    ctx.strokeStyle = '#3a3a5e';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, ry, 40, 180);

    // Server units
    for (let j = 0; j < 6; j++) {
      const uy = ry + 5 + j * 28;
      ctx.fillStyle = '#111118';
      ctx.fillRect(rx + 3, uy, 34, 22);
      // LED
      const blink = Math.sin(frame * 0.05 + i * 1.5 + j * 0.8) > 0;
      ctx.fillStyle = blink ? '#22c55e' : '#166534';
      ctx.fillRect(rx + 32, uy + 3, 3, 3);
      // Second LED — occasionally red
      const isAlert = Math.sin(frame * 0.02 + i * 2.1) > 0.9;
      ctx.fillStyle = isAlert ? '#ef4444' : '#3b82f6';
      ctx.fillRect(rx + 32, uy + 10, 3, 3);
      // Vent lines
      ctx.fillStyle = '#1a1a28';
      for (let v = 0; v < 3; v++) {
        ctx.fillRect(rx + 5 + v * 8, uy + 16, 6, 1);
      }
    }
  }

  // Cables on floor
  ctx.strokeStyle = '#4a4a6e44';
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
  ctx.strokeRect(900, 40, 45, 25);
  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('22°C', 922, 57);
}

// ===== MAIN OFFICE DESKS =====

function drawMainOfficeDesks(ctx: CanvasRenderingContext2D, frame: number, agents: AgentState[]) {
  // Potted plants
  drawPlant(ctx, 50, 290, frame);
  drawPlant(ctx, 900, 290, frame);
  drawPlant(ctx, 50, 460, frame);
  drawPlant(ctx, 900, 460, frame);

  // Printer
  drawPrinter(ctx, 920, 380);

  // Trash can
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(30, 400, 16, 20);
  ctx.fillStyle = '#555';
  ctx.fillRect(28, 398, 20, 4);

  // Draw all desks with unique features
  for (const agent of agents) {
    const desk = DESK_LAYOUT[agent.desk];
    if (!desk) continue;
    drawDesk48(ctx, desk.x, desk.y, agent, frame);
  }
}

function drawDesk48(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  // Desk surface
  ctx.fillStyle = '#3d2b1f';
  ctx.fillRect(x - 32, y + 10, 64, 24);
  // Desk edge highlight
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(x - 32, y + 10, 64, 3);
  // Desk legs
  ctx.fillStyle = '#2a1f14';
  ctx.fillRect(x - 30, y + 34, 5, 10);
  ctx.fillRect(x + 25, y + 34, 5, 10);

  // Chair
  ctx.fillStyle = '#333350';
  ctx.fillRect(x - 10, y + 44, 20, 12);
  ctx.fillStyle = '#2a2a44';
  ctx.fillRect(x - 8, y + 38, 16, 8);

  // Monitor(s) based on agent
  if (agent.desk === 'dev') {
    // Scotty: dual monitors
    drawMonitor(ctx, x - 14, y - 6, agent.color, frame, true);
    drawMonitor(ctx, x + 10, y - 6, agent.color, frame, true);
  } else if (agent.desk === 'trading') {
    // Gordon: extra monitor with chart
    drawMonitor(ctx, x - 6, y - 6, agent.color, frame, false);
    drawChartMonitor(ctx, x + 18, y - 4, frame);
  } else {
    drawMonitor(ctx, x - 6, y - 6, agent.color, frame, false);
  }

  // Keyboard
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 12, y + 18, 24, 6);
  ctx.fillStyle = '#2a2a2a';
  // Key dots
  for (let kx = 0; kx < 5; kx++) {
    ctx.fillRect(x - 10 + kx * 5, y + 19, 3, 2);
    ctx.fillRect(x - 10 + kx * 5, y + 22, 3, 2);
  }

  // Agent-specific desk items
  if (agent.desk === 'design') {
    // Nova: small easel
    ctx.fillStyle = '#8b6914';
    ctx.fillRect(x + 36, y + 5, 3, 30);
    ctx.fillRect(x + 30, y + 35, 16, 2);
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(x + 32, y, 14, 18);
    ctx.fillStyle = '#ec489944';
    ctx.fillRect(x + 34, y + 3, 5, 5);
    ctx.fillStyle = '#3b82f644';
    ctx.fillRect(x + 36, y + 9, 7, 4);
  }
  if (agent.desk === 'research') {
    // Watson: stack of books
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(x + 28, y + 12, 18, 4);
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(x + 28, y + 8, 18, 4);
    ctx.fillStyle = '#5c1e1e';
    ctx.fillRect(x + 28, y + 4, 18, 4);
    // Papers
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(x - 30, y + 14, 12, 8);
    ctx.fillStyle = '#e0e0d0';
    ctx.fillRect(x - 28, y + 16, 8, 1);
    ctx.fillRect(x - 28, y + 18, 6, 1);
  }
  if (agent.desk === 'strategy') {
    // Rex: small whiteboard nearby
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(x + 34, y - 4, 20, 16);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 34, y - 4, 20, 16);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x + 37, y, 4, 1);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(x + 37, y + 4, 8, 1);
  }
}

function drawMonitor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, frame: number, isCode: boolean) {
  // Monitor frame
  ctx.fillStyle = '#111118';
  ctx.fillRect(x, y, 20, 16);
  // Screen
  ctx.fillStyle = color + '44';
  ctx.fillRect(x + 1, y + 1, 18, 12);
  // Screen content
  if (isCode) {
    // Code scrolling effect
    const scrollOff = (frame * 0.3) % 10;
    ctx.fillStyle = color + '66';
    for (let line = 0; line < 4; line++) {
      const lw = 6 + ((line + Math.floor(scrollOff)) % 3) * 3;
      ctx.fillRect(x + 3, y + 2 + line * 3, lw, 1);
    }
  }
  // Stand
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 8, y + 14, 4, 4);
  ctx.fillRect(x + 5, y + 17, 10, 2);
}

function drawChartMonitor(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  ctx.fillStyle = '#111118';
  ctx.fillRect(x, y, 18, 14);
  // Candle chart
  for (let i = 0; i < 6; i++) {
    const h = 3 + Math.sin(frame * 0.02 + i) * 3;
    const isGreen = Math.sin(frame * 0.03 + i * 1.5) > 0;
    ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
    ctx.fillRect(x + 2 + i * 2.5, y + 10 - h, 2, h);
  }
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 6, y + 12, 4, 4);
  ctx.fillRect(x + 4, y + 15, 10, 2);
}

function drawPrinter(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(x, y, 30, 18);
  ctx.fillStyle = '#ccc';
  ctx.fillRect(x + 2, y + 2, 26, 6);
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(x + 2, y + 10, 26, 6);
  // Paper tray
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(x + 4, y - 4, 22, 6);
}

// ===== KITCHEN =====

function drawKitchen(ctx: CanvasRenderingContext2D, frame: number) {
  const kx = 20, ky = 540;

  // Counter
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(kx, ky + 20, 260, 14);
  ctx.fillStyle = '#6a5040';
  ctx.fillRect(kx, ky + 20, 260, 3);

  // Coffee machine
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(kx + 20, ky, 30, 24);
  ctx.fillStyle = '#333';
  ctx.fillRect(kx + 22, ky + 2, 26, 12);
  // Cup
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(kx + 28, ky + 14, 10, 8);
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(kx + 29, ky + 15, 8, 5);
  // Steam particles
  for (let i = 0; i < 3; i++) {
    const sy = ky - 5 - i * 6 - Math.sin(frame * 0.08 + i) * 3;
    const sx = kx + 33 + Math.sin(frame * 0.06 + i * 2) * 2;
    ctx.fillStyle = `rgba(200,200,200,${0.3 - i * 0.08})`;
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Fridge
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(kx + 200, ky - 20, 40, 60);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(kx + 200, ky - 20, 40, 30);
  ctx.strokeRect(kx + 200, ky + 10, 40, 20);
  // Handle
  ctx.fillStyle = '#888';
  ctx.fillRect(kx + 236, ky - 5, 2, 10);
  ctx.fillRect(kx + 236, ky + 15, 2, 8);

  // Stools
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#4a4a5e';
    ctx.fillRect(kx + 60 + i * 50, ky + 50, 14, 6);
    ctx.fillStyle = '#3a3a4e';
    ctx.fillRect(kx + 65 + i * 50, ky + 56, 4, 10);
  }
}

// ===== GAME ROOM =====

function drawGameRoom(ctx: CanvasRenderingContext2D, frame: number) {
  const gx = 320, gy = 540;

  // Ping pong table
  ctx.fillStyle = '#1e5c3a';
  ctx.fillRect(gx + 100, gy + 20, 120, 60);
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + 100, gy + 20, 120, 60);
  // Net
  ctx.fillStyle = '#f5f5f544';
  ctx.fillRect(gx + 158, gy + 20, 4, 60);
  // Table legs
  ctx.fillStyle = '#333';
  ctx.fillRect(gx + 104, gy + 80, 4, 8);
  ctx.fillRect(gx + 212, gy + 80, 4, 8);

  // Arcade cabinet
  ctx.fillStyle = '#1a1a3e';
  ctx.fillRect(gx + 280, gy, 35, 60);
  ctx.fillStyle = '#111';
  ctx.fillRect(gx + 283, gy + 5, 29, 22);
  // Screen glow
  const glowColor = `hsl(${(frame * 2) % 360}, 70%, 50%)`;
  ctx.fillStyle = glowColor + '44';
  ctx.fillRect(gx + 285, gy + 7, 25, 18);
  // Joystick
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(gx + 294, gy + 35, 5, 5);
  // Buttons
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(gx + 302, gy + 37, 4, 4);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(gx + 308, gy + 36, 4, 4);

  // Beanbag chairs
  drawBeanbag(ctx, gx + 380, gy + 60, '#4a2060');
  drawBeanbag(ctx, gx + 430, gy + 70, '#203060');
  drawBeanbag(ctx, gx + 340, gy + 80, '#205030');

  // TV on wall
  ctx.fillStyle = '#111118';
  ctx.fillRect(gx + 400, gy - 10, 60, 35);
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + 400, gy - 10, 60, 35);
  // Static/noise
  for (let i = 0; i < 20; i++) {
    const nx = gx + 402 + Math.floor(Math.random() * 56);
    const ny = gy - 8 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
    ctx.fillRect(nx, ny, 2, 2);
  }
}

function drawBeanbag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color + '88';
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
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

// ===== DAY/NIGHT CYCLE =====

function drawDayNightOverlay(ctx: CanvasRenderingContext2D) {
  const now = new Date();
  // AEST = UTC + 10
  const aestHour = (now.getUTCHours() + 10) % 24;

  // Night: 22-6 AEST
  if (aestHour >= 22 || aestHour < 6) {
    ctx.fillStyle = 'rgba(0,0,20,0.25)';
    ctx.fillRect(0, 0, W, H);

    // Desk lamp glows for main office area
    const lamps = [
      { x: 100, y: 300 }, { x: 380, y: 300 }, { x: 660, y: 300 },
    ];
    for (const lamp of lamps) {
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 5, lamp.x, lamp.y, 50);
      grad.addColorStop(0, 'rgba(255,200,100,0.15)');
      grad.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lamp.x - 50, lamp.y - 50, 100, 100);
    }
  } else if (aestHour >= 18 || aestHour < 7) {
    // Dusk/dawn
    ctx.fillStyle = 'rgba(0,0,20,0.1)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ===== AMBIENT EFFECTS =====

function drawAmbient(ctx: CanvasRenderingContext2D, frame: number) {
  // Plant leaf sway is handled in drawPlant already

  // Occasional server blink (already in drawServerRoom)

  // Subtle floor reflections in meeting room (glass effect)
  if (frame % 120 < 60) {
    ctx.fillStyle = 'rgba(99,102,241,0.02)';
    ctx.fillRect(2, 2, 436, 256);
  }
}

// ===== PLANT =====

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const sway = Math.sin(frame * 0.015) * 1.5;
  // Pot
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x, y + 16, 16, 12);
  ctx.fillRect(x - 2, y + 14, 20, 4);
  // Stem
  ctx.fillStyle = '#166534';
  ctx.fillRect(x + 7, y + 6, 3, 10);
  // Leaves
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x + 2 + sway, y, 12, 6);
  ctx.fillRect(x - 2 + sway, y + 4, 8, 5);
  ctx.fillRect(x + 10 + sway, y + 3, 8, 5);
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(x + 4 + sway, y + 2, 6, 4);
}

// ===== 48x48 AGENT DRAWING =====

function drawAgent48(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  agent: AgentState,
  anim: AnimAgent,
  frame: number
) {
  const { state } = anim;

  if (state === 'sleeping') {
    drawSleepingAgent48(ctx, x, y, agent, frame);
    return;
  }

  if (state === 'walking') {
    drawWalkingAgent48(ctx, x, y, agent, anim, frame);
    return;
  }

  if (state === 'coffee') {
    drawCoffeeAgent48(ctx, x, y, agent, frame);
    return;
  }

  if (state === 'meeting') {
    drawMeetingAgent48(ctx, x, y, agent, frame);
    return;
  }

  if (state === 'sitting') {
    drawSittingAgent48(ctx, x, y, agent, frame);
    return;
  }

  // Default: standing idle
  drawStandingAgent48(ctx, x, y, agent, frame);
}

function drawSittingAgent48(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const bob = agent.status === 'active' ? Math.sin(frame * 0.12) * 1.5 : Math.sin(frame * 0.03) * 0.5;
  const dy = y - 20 + bob; // Offset up to sit at desk

  // Body
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 7, dy + 6, 14, 14);

  // Head
  ctx.fillStyle = '#f0d0a0';
  ctx.fillRect(x - 6, dy - 8, 12, 12);

  // Eyes
  ctx.fillStyle = '#111';
  const blink = frame % 180 < 3;
  if (!blink) {
    ctx.fillRect(x - 4, dy - 3, 3, 3);
    ctx.fillRect(x + 1, dy - 3, 3, 3);
  } else {
    ctx.fillRect(x - 4, dy - 2, 3, 1);
    ctx.fillRect(x + 1, dy - 2, 3, 1);
  }

  // Hair
  ctx.fillStyle = darkenColor(agent.color, 0.5);
  ctx.fillRect(x - 7, dy - 10, 14, 5);

  // Arms on keyboard (typing animation)
  ctx.fillStyle = agent.color;
  if (agent.status === 'active') {
    const armBob = Math.sin(frame * 0.2) > 0 ? 1 : -1;
    ctx.fillRect(x - 12, dy + 8 + armBob, 5, 8);
    ctx.fillRect(x + 7, dy + 8 - armBob, 5, 8);
    // Hands
    ctx.fillStyle = '#f0d0a0';
    ctx.fillRect(x - 12, dy + 14 + armBob, 4, 3);
    ctx.fillRect(x + 8, dy + 14 - armBob, 4, 3);
  } else {
    ctx.fillRect(x - 12, dy + 8, 5, 8);
    ctx.fillRect(x + 7, dy + 8, 5, 8);
  }

  // Accessory
  drawAccessory48(ctx, x, dy, agent);

  // Status dot
  drawStatusDot(ctx, x + 9, dy - 9, agent.status);

  // Name
  drawAgentName(ctx, x, y + 28, agent.name, agent.status);

  // Speech bubble
  if (agent.status === 'active' && agent.currentTask) {
    drawSpeechBubble(ctx, x, dy - 22, agent.currentTask.substring(0, 30));
  }
}

function drawStandingAgent48(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  // Subtle weight shift
  const shift = Math.sin(frame * 0.04) * 1;
  const dx = x + shift;

  // Legs
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(dx - 5, y + 18, 4, 10);
  ctx.fillRect(dx + 1, y + 18, 4, 10);

  // Body
  ctx.fillStyle = agent.color;
  ctx.fillRect(dx - 7, y + 4, 14, 16);

  // Head
  ctx.fillStyle = '#f0d0a0';
  ctx.fillRect(dx - 6, y - 10, 12, 12);

  // Eyes
  ctx.fillStyle = '#111';
  ctx.fillRect(dx - 4, y - 5, 3, 3);
  ctx.fillRect(dx + 1, y - 5, 3, 3);

  // Hair
  ctx.fillStyle = darkenColor(agent.color, 0.5);
  ctx.fillRect(dx - 7, y - 12, 14, 5);

  // Arms
  ctx.fillStyle = agent.color;
  ctx.fillRect(dx - 12, y + 6, 5, 10);
  ctx.fillRect(dx + 7, y + 6, 5, 10);

  drawAccessory48(ctx, dx, y - 2, agent);
  drawStatusDot(ctx, dx + 9, y - 11, agent.status);
  drawAgentName(ctx, x, y + 34, agent.name, agent.status);
}

function drawWalkingAgent48(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, anim: AnimAgent, frame: number) {
  // 8-frame walk cycle
  const walkPhase = (anim.walkFrame % 32) / 32;
  const legSwing = Math.sin(walkPhase * Math.PI * 2) * 4;
  const armSwing = Math.sin(walkPhase * Math.PI * 2) * 3;
  const headBob = Math.abs(Math.sin(walkPhase * Math.PI * 2)) * 1.5;

  const dy = y - headBob;

  // Legs
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x - 5, y + 18 - legSwing, 4, 10 + legSwing);
  ctx.fillRect(x + 1, y + 18 + legSwing, 4, 10 - legSwing);
  // Shoes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x - 6, y + 26, 5, 3);
  ctx.fillRect(x + 1, y + 26, 5, 3);

  // Body
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 7, dy + 4, 14, 16);

  // Head
  ctx.fillStyle = '#f0d0a0';
  ctx.fillRect(x - 6, dy - 10, 12, 12);

  // Eyes (looking in movement direction)
  ctx.fillStyle = '#111';
  const lookDir = anim.targetX > anim.x ? 1 : -1;
  ctx.fillRect(x - 4 + lookDir, dy - 5, 3, 3);
  ctx.fillRect(x + 1 + lookDir, dy - 5, 3, 3);

  // Hair
  ctx.fillStyle = darkenColor(agent.color, 0.5);
  ctx.fillRect(x - 7, dy - 12, 14, 5);

  // Arms swinging
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 12, dy + 6 - armSwing, 5, 10);
  ctx.fillRect(x + 7, dy + 6 + armSwing, 5, 10);

  drawAccessory48(ctx, x, dy - 2, agent);
  drawAgentName(ctx, x, y + 34, agent.name, agent.status);
}

function drawSleepingAgent48(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  // Lying on beanbag — more horizontal
  const breathe = Math.sin(frame * 0.04) * 0.5;

  // Body (horizontal-ish)
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 12, y + breathe, 24, 10);

  // Head (to the side)
  ctx.fillStyle = '#f0d0a0';
  ctx.fillRect(x - 16, y - 4 + breathe, 10, 9);

  // Closed eyes
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 14, y + breathe, 2, 1);
  ctx.fillRect(x - 10, y + breathe, 2, 1);

  // Hair
  ctx.fillStyle = darkenColor(agent.color, 0.5);
  ctx.fillRect(x - 17, y - 6 + breathe, 12, 4);

  // Legs tucked
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x + 8, y + 4 + breathe, 8, 4);
  ctx.fillRect(x + 12, y + 6 + breathe, 8, 4);

  // ZZZ
  const zFloat = Math.sin(frame * 0.06) * 3;
  ctx.fillStyle = '#9ca3af66';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('z', x - 10, y - 10 + zFloat);
  ctx.font = '10px monospace';
  ctx.fillText('z', x - 5, y - 18 + zFloat * 0.7);
  ctx.font = '13px monospace';
  ctx.fillText('Z', x, y - 26 + zFloat * 0.5);

  // Name
  ctx.fillStyle = '#4b5563';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, x, y + 22);
}

function drawCoffeeAgent48(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const shift = Math.sin(frame * 0.03) * 0.5;

  // Legs
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x - 5, y + 18, 4, 10);
  ctx.fillRect(x + 1, y + 18, 4, 10);

  // Body
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 7, y + 4 + shift, 14, 16);

  // Head
  ctx.fillStyle = '#f0d0a0';
  ctx.fillRect(x - 6, y - 10 + shift, 12, 12);

  // Eyes (relaxed)
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 4, y - 5 + shift, 2, 2);
  ctx.fillRect(x + 2, y - 5 + shift, 2, 2);
  // Smile
  ctx.fillRect(x - 2, y - 1 + shift, 4, 1);

  // Hair
  ctx.fillStyle = darkenColor(agent.color, 0.5);
  ctx.fillRect(x - 7, y - 12 + shift, 14, 5);

  // Left arm down
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 12, y + 6 + shift, 5, 10);

  // Right arm holding mug
  ctx.fillRect(x + 7, y + 4 + shift, 5, 8);

  // Coffee mug
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(x + 12, y + 6 + shift, 7, 7);
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(x + 13, y + 7 + shift, 5, 4);
  // Handle
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + 19, y + 9 + shift, 2, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();

  // Steam from mug
  const steam = Math.sin(frame * 0.1) * 1.5;
  ctx.fillStyle = 'rgba(200,200,200,0.3)';
  ctx.fillRect(x + 14 + steam, y + 2 + shift, 2, 2);
  ctx.fillRect(x + 16 - steam, y - 1 + shift, 2, 2);

  // Chat bubble
  drawSpeechBubble(ctx, x, y - 24, '☕ break');

  drawAccessory48(ctx, x, y - 2 + shift, agent);
  drawAgentName(ctx, x, y + 34, agent.name, agent.status);
}

function drawMeetingAgent48(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  // Sitting in meeting chair
  const gesturing = Math.sin(frame * 0.08 + x * 0.1) > 0.6;
  const bob = Math.sin(frame * 0.05) * 0.5;
  const dy = y + bob;

  // Legs (under table)
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x - 5, dy + 16, 4, 6);
  ctx.fillRect(x + 1, dy + 16, 4, 6);

  // Body
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 7, dy + 4, 14, 14);

  // Head
  ctx.fillStyle = '#f0d0a0';
  ctx.fillRect(x - 6, dy - 8, 12, 12);

  // Eyes
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 4, dy - 3, 3, 3);
  ctx.fillRect(x + 1, dy - 3, 3, 3);

  // Hair
  ctx.fillStyle = darkenColor(agent.color, 0.5);
  ctx.fillRect(x - 7, dy - 10, 14, 5);

  // Arms (gesturing occasionally)
  ctx.fillStyle = agent.color;
  if (gesturing) {
    ctx.fillRect(x - 14, dy + 2, 5, 8);  // Raised arm
    ctx.fillRect(x + 7, dy + 6, 5, 8);
    // Hand up
    ctx.fillStyle = '#f0d0a0';
    ctx.fillRect(x - 14, dy, 4, 4);
  } else {
    ctx.fillRect(x - 12, dy + 6, 5, 8);
    ctx.fillRect(x + 7, dy + 6, 5, 8);
  }

  drawAccessory48(ctx, x, dy - 2, agent);
  drawStatusDot(ctx, x + 9, dy - 9, agent.status);
  drawAgentName(ctx, x, y + 30, agent.name, agent.status);
}

// ===== ACCESSORIES (48px scale) =====

function drawAccessory48(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState) {
  const acc = agent.accessory;
  const color = agent.color;

  switch (acc) {
    case 'crown':
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x - 6, y - 10, 12, 4);
      ctx.fillRect(x - 7, y - 13, 3, 3);
      ctx.fillRect(x - 1, y - 14, 3, 4);
      ctx.fillRect(x + 5, y - 13, 3, 3);
      // Gems
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x - 1, y - 12, 2, 2);
      break;
    case 'glasses':
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 5, y - 4, 5, 4);
      ctx.strokeRect(x + 1, y - 4, 5, 4);
      ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + 1, y - 2); ctx.stroke();
      // Lens shine
      ctx.fillStyle = '#94a3b822';
      ctx.fillRect(x - 4, y - 3, 2, 2);
      break;
    case 'hat':
      ctx.fillStyle = color;
      ctx.fillRect(x - 8, y - 8, 16, 3);
      ctx.fillRect(x - 5, y - 14, 10, 6);
      break;
    case 'badge':
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(x - 9, y + 5);
      ctx.lineTo(x - 5, y + 3);
      ctx.lineTo(x - 1, y + 5);
      ctx.lineTo(x - 3, y + 9);
      ctx.lineTo(x - 7, y + 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(x - 6, y + 5, 2, 2);
      break;
    case 'headphones':
      ctx.fillStyle = '#333';
      ctx.fillRect(x - 8, y - 5, 3, 8);
      ctx.fillRect(x + 6, y - 5, 3, 8);
      ctx.fillRect(x - 7, y - 9, 14, 3);
      // Ear pads
      ctx.fillStyle = '#444';
      ctx.fillRect(x - 9, y - 3, 4, 5);
      ctx.fillRect(x + 6, y - 3, 4, 5);
      break;
    case 'scarf':
      ctx.fillStyle = color;
      ctx.fillRect(x - 8, y + 4, 16, 4);
      ctx.fillRect(x - 9, y + 8, 4, 6);
      ctx.fillStyle = darkenColor(color, 0.3);
      ctx.fillRect(x - 8, y + 5, 16, 1);
      break;
    case 'cap':
      ctx.fillStyle = color;
      ctx.fillRect(x - 6, y - 10, 12, 4);
      ctx.fillRect(x + 4, y - 9, 7, 3);
      break;
    case 'bowtie':
      ctx.fillStyle = '#ec4899';
      ctx.beginPath();
      ctx.moveTo(x - 1, y + 4);
      ctx.lineTo(x - 6, y + 2);
      ctx.lineTo(x - 6, y + 7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 4);
      ctx.lineTo(x + 6, y + 2);
      ctx.lineTo(x + 6, y + 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - 1, y + 3, 3, 3);
      break;
    case 'visor':
      ctx.fillStyle = '#22c55e66';
      ctx.fillRect(x - 6, y - 4, 13, 4);
      ctx.fillStyle = '#22c55e33';
      ctx.fillRect(x - 5, y - 3, 11, 2);
      break;
    case 'antenna':
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(x, y - 14, 2, 7);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x + 1, y - 16, 3, 0, Math.PI * 2);
      ctx.fill();
      // Blink
      ctx.fillStyle = '#ef444488';
      ctx.beginPath();
      ctx.arc(x + 1, y - 16, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'monocle':
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + 3, y - 1, 4, 0, Math.PI * 2);
      ctx.stroke();
      // Chain
      ctx.strokeStyle = '#fbbf2488';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 1);
      ctx.lineTo(x + 9, y + 8);
      ctx.stroke();
      break;
  }
}

// ===== SPEECH BUBBLE =====

function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  const w = Math.min(text.length * 5 + 14, 160);
  const bx = x - w / 2;
  const by = y - 14;

  ctx.fillStyle = '#1a1a2eDD';
  ctx.strokeStyle = '#4a4a6e';
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.roundRect(bx, by, w, 14, 4);
  ctx.fill();
  ctx.stroke();

  // Pointer
  ctx.fillStyle = '#1a1a2eDD';
  ctx.beginPath();
  ctx.moveTo(x - 4, by + 14);
  ctx.lineTo(x, by + 19);
  ctx.lineTo(x + 4, by + 14);
  ctx.fill();

  ctx.fillStyle = '#e0e0e0';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, by + 10);
}

// ===== UTILITY DRAWING =====

function drawStatusDot(ctx: CanvasRenderingContext2D, x: number, y: number, status: string) {
  const color = status === 'active' ? '#22c55e' : status === 'idle' ? '#eab308' : '#4b5563';
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a0a0f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.stroke();

  // Glow for active
  if (status === 'active') {
    ctx.fillStyle = '#22c55e33';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAgentName(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, status: string) {
  ctx.fillStyle = status === 'offline' ? '#4b5563' : '#d0d0d0';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(name, x, y);
}

function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 255) * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}
