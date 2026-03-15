import { NextResponse } from 'next/server';
import { AGENTS, ActivityItem } from '@/lib/agents';
import * as fs from 'fs';
import * as path from 'path';

let cachedActivities: ActivityItem[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 15000; // 15 seconds

function extractActivities(): ActivityItem[] {
  const home = process.env.HOME || '/home/linuxuser';
  const agentsHome = path.join(home, '.openclaw', 'agents');
  const cronRunsDir = path.join(home, '.openclaw', 'cron', 'runs');
  const activities: ActivityItem[] = [];

  // Scan agent session files
  for (const agent of AGENTS) {
    try {
      const sessionsDir = path.join(agentsHome, agent.id, 'sessions');
      if (!fs.existsSync(sessionsDir)) continue;

      const files = fs.readdirSync(sessionsDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(sessionsDir, f)).mtime }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, 3); // Last 3 session files per agent

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(sessionsDir, file.name), 'utf-8');
          const lines = content.trim().split('\n').slice(-50);

          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              
              // Extract user messages as tasks/requests
              if (entry.role === 'user' && typeof entry.content === 'string' && entry.content.length > 15 && entry.content.length < 200) {
                const text = entry.content.replace(/\n/g, ' ').substring(0, 120);
                // Skip system-like messages
                if (text.startsWith('[') || text.startsWith('Read ') || text.startsWith('HEARTBEAT')) continue;
                activities.push({
                  timestamp: entry.timestamp || file.mtime.toISOString(),
                  agentId: agent.id,
                  agentName: agent.name,
                  agentEmoji: agent.emoji,
                  message: text,
                });
              }

              // Extract tool completions
              if (entry.role === 'assistant' && entry.tool_calls && Array.isArray(entry.tool_calls)) {
                for (const tc of entry.tool_calls) {
                  const fn = tc?.function?.name;
                  if (fn && !['read', 'Read'].includes(fn)) {
                    activities.push({
                      timestamp: entry.timestamp || file.mtime.toISOString(),
                      agentId: agent.id,
                      agentName: agent.name,
                      agentEmoji: agent.emoji,
                      message: `Using tool: ${fn}`,
                    });
                  }
                }
              }
            } catch {
              continue;
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  // Scan cron runs
  try {
    if (fs.existsSync(cronRunsDir)) {
      const cronFiles = fs.readdirSync(cronRunsDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(cronRunsDir, f)).mtime }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, 10);

      for (const file of cronFiles) {
        try {
          const content = fs.readFileSync(path.join(cronRunsDir, file.name), 'utf-8');
          const lines = content.trim().split('\n').slice(0, 5);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.role === 'user' && typeof entry.content === 'string') {
                const text = entry.content.replace(/\n/g, ' ').substring(0, 120);
                activities.push({
                  timestamp: file.mtime.toISOString(),
                  agentId: 'cron',
                  agentName: 'Cron',
                  agentEmoji: '⏰',
                  message: text,
                });
              }
            } catch { continue; }
          }
        } catch { continue; }
      }
    }
  } catch { /* ignore */ }

  // Sort by timestamp, newest first, deduplicate
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Deduplicate similar messages
  const seen = new Set<string>();
  const unique = activities.filter(a => {
    const key = `${a.agentId}:${a.message.substring(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, 30);
}

export async function GET() {
  try {
    const now = Date.now();
    if (!cachedActivities || now - cacheTime > CACHE_TTL) {
      cachedActivities = extractActivities();
      cacheTime = now;
    }

    return NextResponse.json({ activities: cachedActivities, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[api/agents/activity]', err);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}
