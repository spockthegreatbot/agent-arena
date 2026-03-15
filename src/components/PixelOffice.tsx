'use client';

import { useEffect, useRef, useCallback } from 'react';
import { AgentState } from '@/lib/agents';

// Desk positions in the office grid (pixel coordinates on 640x480 canvas)
const DESK_POSITIONS: Record<string, { x: number; y: number }> = {
  command: { x: 310, y: 80 },    // Spock center-top (command center)
  dev: { x: 100, y: 160 },       // Scotty left
  trading: { x: 520, y: 160 },   // Gordon right
  research: { x: 100, y: 260 },  // Watson left-mid
  design: { x: 310, y: 180 },    // Nova center
  security: { x: 520, y: 260 },  // Cipher right-mid
  content: { x: 200, y: 360 },   // Oscar bottom-left
  strategy: { x: 420, y: 360 },  // Rex bottom-right
  engineering: { x: 100, y: 380 },// Rook far-left-bottom
  pm: { x: 310, y: 340 },        // Atlas center-bottom
  finance: { x: 520, y: 380 },   // Ledger far-right-bottom
};

interface PixelOfficeProps {
  agents: AgentState[];
}

// Simple procedural pixel art drawn on 2D canvas
export default function PixelOffice({ agents }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);

  const drawOffice = useCallback((ctx: CanvasRenderingContext2D, frame: number) => {
    const W = 640;
    const H = 480;
    ctx.imageSmoothingEnabled = false;

    // Background floor
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Floor tiles (checkerboard)
    for (let x = 0; x < W; x += 32) {
      for (let y = 0; y < H; y += 32) {
        const isLight = ((x / 32) + (y / 32)) % 2 === 0;
        ctx.fillStyle = isLight ? '#1e1e35' : '#16162a';
        ctx.fillRect(x, y, 32, 32);
      }
    }

    // Floor grid lines (subtle)
    ctx.strokeStyle = '#2a2a3e22';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Walls
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(0, 0, W, 40); // Top wall
    ctx.fillStyle = '#222238';
    ctx.fillRect(0, 0, 8, H);  // Left wall
    ctx.fillRect(W - 8, 0, 8, H); // Right wall

    // Wall decoration - "AGENT ARENA" sign
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(220, 8, 200, 24);
    ctx.strokeStyle = '#9333ea44';
    ctx.strokeRect(220, 8, 200, 24);
    ctx.fillStyle = '#9333ea';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ AGENT ARENA ⚡', 320, 26);

    // Decorative elements
    drawServerRack(ctx, 16, 60);
    drawServerRack(ctx, 16, 120);
    drawPlant(ctx, 600, 60, frame);
    drawPlant(ctx, 600, 300, frame);
    drawCoffeeMachine(ctx, 580, 440);
    drawWaterCooler(ctx, 40, 440);

    // Draw desks first (behind agents)
    for (const agent of agents) {
      const pos = DESK_POSITIONS[agent.desk];
      if (!pos) continue;
      drawDesk(ctx, pos.x, pos.y, agent.color);
    }

    // Draw agents on top
    for (const agent of agents) {
      const pos = DESK_POSITIONS[agent.desk];
      if (!pos) continue;
      drawAgent(ctx, pos.x, pos.y - 16, agent, frame);
    }
  }, [agents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      frameRef.current++;
      drawOffice(ctx, frameRef.current);
      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [drawOffice]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#0a0a0f]">
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="border border-[#2a2a3e] rounded-lg"
        style={{ imageRendering: 'pixelated', width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  // Desk surface
  ctx.fillStyle = '#3d2b1f';
  ctx.fillRect(x - 24, y + 8, 48, 20);
  // Desk legs
  ctx.fillStyle = '#2a1f14';
  ctx.fillRect(x - 22, y + 28, 4, 8);
  ctx.fillRect(x + 18, y + 28, 4, 8);
  // Monitor
  ctx.fillStyle = '#111118';
  ctx.fillRect(x - 10, y - 4, 20, 14);
  // Screen glow
  ctx.fillStyle = color + '88';
  ctx.fillRect(x - 8, y - 2, 16, 10);
  // Monitor stand
  ctx.fillStyle = '#333';
  ctx.fillRect(x - 2, y + 10, 4, 4);
  // Keyboard
  ctx.fillStyle = '#222';
  ctx.fillRect(x - 8, y + 16, 16, 4);
}

function drawAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  const bobOffset = agent.status === 'active'
    ? Math.sin(frame * 0.1) * 1.5  // Typing bob
    : agent.status === 'idle'
      ? Math.sin(frame * 0.03) * 0.8  // Slow breathing
      : 0;

  const drawY = y + bobOffset;

  if (agent.status === 'offline') {
    // Sleeping agent - slumped
    drawSleepingAgent(ctx, x, y, agent, frame);
    return;
  }

  // Body
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 5, drawY + 4, 10, 12); // Torso

  // Head
  ctx.fillStyle = '#f0d0a0'; // Skin
  ctx.fillRect(x - 4, drawY - 5, 8, 9);

  // Eyes
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 3, drawY - 2, 2, 2);
  ctx.fillRect(x + 1, drawY - 2, 2, 2);

  // Hair (color based on agent)
  ctx.fillStyle = darkenColor(agent.color, 0.5);
  ctx.fillRect(x - 5, drawY - 7, 10, 4);

  // Arms
  ctx.fillStyle = agent.color;
  if (agent.status === 'active') {
    // Typing animation
    const armOffset = Math.sin(frame * 0.15) > 0 ? 1 : -1;
    ctx.fillRect(x - 8, drawY + 6 + armOffset, 3, 6);
    ctx.fillRect(x + 5, drawY + 6 - armOffset, 3, 6);
  } else {
    ctx.fillRect(x - 8, drawY + 6, 3, 6);
    ctx.fillRect(x + 5, drawY + 6, 3, 6);
  }

  // Legs
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x - 4, drawY + 16, 3, 6);
  ctx.fillRect(x + 1, drawY + 16, 3, 6);

  // Accessory
  drawAccessory(ctx, x, drawY, agent.accessory as AgentState['accessory'], agent.color);

  // Status indicator dot
  const statusColor = agent.status === 'active' ? '#22c55e' : agent.status === 'idle' ? '#eab308' : '#ef4444';
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(x + 7, drawY - 6, 3, 0, Math.PI * 2);
  ctx.fill();
  // Dot outline
  ctx.strokeStyle = '#0a0a0f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + 7, drawY - 6, 3, 0, Math.PI * 2);
  ctx.stroke();

  // Name label
  ctx.fillStyle = '#e0e0e0';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, x, drawY + 30);

  // Speech bubble for active agents
  if (agent.status === 'active' && agent.currentTask) {
    drawSpeechBubble(ctx, x, drawY - 20, agent.currentTask.substring(0, 25));
  }
}

function drawSleepingAgent(ctx: CanvasRenderingContext2D, x: number, y: number, agent: AgentState, frame: number) {
  // Slumped on desk - body leaning forward
  ctx.fillStyle = agent.color;
  ctx.fillRect(x - 5, y + 2, 10, 10); // Torso slumped

  // Head on desk
  ctx.fillStyle = '#f0d0a0';
  ctx.fillRect(x - 4, y - 1, 8, 7);

  // Closed eyes (lines)
  ctx.fillStyle = '#111';
  ctx.fillRect(x - 3, y + 1, 2, 1);
  ctx.fillRect(x + 1, y + 1, 2, 1);

  // Hair
  ctx.fillStyle = darkenColor(agent.color, 0.5);
  ctx.fillRect(x - 5, y - 3, 10, 4);

  // ZZZ
  const zOffset = Math.sin(frame * 0.05) * 2;
  ctx.fillStyle = '#9ca3af88';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('z', x + 8, y - 4 + zOffset);
  ctx.fillText('z', x + 13, y - 9 + zOffset * 0.7);
  ctx.font = '9px monospace';
  ctx.fillText('Z', x + 18, y - 14 + zOffset * 0.5);

  // Offline dot
  ctx.fillStyle = '#4b5563';
  ctx.beginPath();
  ctx.arc(x + 7, y - 5, 3, 0, Math.PI * 2);
  ctx.fill();

  // Name
  ctx.fillStyle = '#6b7280';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, x, y + 30);
}

function drawAccessory(ctx: CanvasRenderingContext2D, x: number, y: number, acc: string, color: string) {
  switch (acc) {
    case 'crown':
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x - 4, y - 9, 8, 3);
      ctx.fillRect(x - 5, y - 10, 2, 2);
      ctx.fillRect(x - 1, y - 11, 2, 2);
      ctx.fillRect(x + 3, y - 10, 2, 2);
      break;
    case 'glasses':
      ctx.fillStyle = '#94a3b8';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 4, y - 3, 3, 3);
      ctx.strokeRect(x + 1, y - 3, 3, 3);
      ctx.beginPath(); ctx.moveTo(x - 1, y - 2); ctx.lineTo(x + 1, y - 2); ctx.stroke();
      break;
    case 'hat':
      ctx.fillStyle = color;
      ctx.fillRect(x - 6, y - 7, 12, 2);
      ctx.fillRect(x - 4, y - 11, 8, 4);
      break;
    case 'badge':
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x - 7, y + 5, 4, 4);
      ctx.fillStyle = '#111';
      ctx.fillRect(x - 6, y + 6, 2, 2);
      break;
    case 'headphones':
      ctx.fillStyle = '#333';
      ctx.fillRect(x - 6, y - 4, 2, 6);
      ctx.fillRect(x + 4, y - 4, 2, 6);
      ctx.fillRect(x - 5, y - 6, 10, 2);
      break;
    case 'scarf':
      ctx.fillStyle = color;
      ctx.fillRect(x - 6, y + 3, 12, 3);
      ctx.fillRect(x - 7, y + 6, 3, 4);
      break;
    case 'cap':
      ctx.fillStyle = color;
      ctx.fillRect(x - 5, y - 8, 10, 3);
      ctx.fillRect(x + 3, y - 7, 5, 2);
      break;
    case 'bowtie':
      ctx.fillStyle = color;
      ctx.fillRect(x - 4, y + 3, 3, 2);
      ctx.fillRect(x + 1, y + 3, 3, 2);
      ctx.fillRect(x - 1, y + 3, 2, 3);
      break;
    case 'visor':
      ctx.fillStyle = '#22c55e88';
      ctx.fillRect(x - 5, y - 3, 10, 3);
      break;
    case 'antenna':
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(x, y - 11, 1, 5);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x + 0.5, y - 12, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'monocle':
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + 2, y - 1, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 5, y); ctx.lineTo(x + 7, y + 6);
      ctx.stroke();
      break;
  }
}

function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  const w = Math.min(text.length * 5 + 10, 120);
  const bx = x - w / 2;
  const by = y - 14;

  ctx.fillStyle = '#1a1a2e';
  ctx.strokeStyle = '#3a3a5e';
  ctx.lineWidth = 1;

  // Bubble
  ctx.beginPath();
  ctx.roundRect(bx, by, w, 12, 3);
  ctx.fill();
  ctx.stroke();

  // Pointer
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.moveTo(x - 3, by + 12);
  ctx.lineTo(x, by + 16);
  ctx.lineTo(x + 3, by + 12);
  ctx.fill();

  // Text
  ctx.fillStyle = '#e0e0e0';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, by + 9);
}

function drawServerRack(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(x, y, 20, 40);
  ctx.fillStyle = '#111';
  ctx.fillRect(x + 2, y + 2, 16, 8);
  ctx.fillRect(x + 2, y + 12, 16, 8);
  ctx.fillRect(x + 2, y + 22, 16, 8);
  // LEDs
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x + 14, y + 4, 2, 2);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(x + 14, y + 14, 2, 2);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x + 14, y + 24, 2, 2);
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  // Pot
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x, y + 16, 16, 12);
  ctx.fillRect(x - 2, y + 14, 20, 4);
  // Leaves (subtle sway)
  const sway = Math.sin(frame * 0.02) * 1;
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x + 4 + sway, y, 8, 6);
  ctx.fillRect(x + sway, y + 4, 6, 6);
  ctx.fillRect(x + 10 + sway, y + 4, 6, 6);
  ctx.fillRect(x + 6 + sway, y + 8, 4, 8);
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(x + 6 + sway, y + 2, 4, 4);
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(x, y, 24, 28);
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 2, y + 2, 20, 12);
  // Cup
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(x + 8, y + 18, 8, 8);
  ctx.fillStyle = '#8b6914';
  ctx.fillRect(x + 9, y + 19, 6, 5);
}

function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(x + 4, y, 12, 24);
  // Water jug
  ctx.fillStyle = '#60a5fa44';
  ctx.fillRect(x + 5, y - 10, 10, 12);
  ctx.fillStyle = '#60a5fa22';
  ctx.fillRect(x + 6, y - 8, 8, 8);
  // Base
  ctx.fillStyle = '#888';
  ctx.fillRect(x + 2, y + 24, 16, 6);
}

function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 255) * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}
