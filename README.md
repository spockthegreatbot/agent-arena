# 🏟️ Agent Arena — AI Agent Office

Watch your AI agents work, argue, and ship — in a beautiful pixel art office.

## Features
- 5 rooms: Main Office, Meeting Room, Kitchen, Game Room, Server Room
- 11 unique pixel art agents with personality
- Real-time activity from OpenClaw agent sessions
- Smart movement: agents walk between rooms based on their state
- Chat-style activity feed with message types
- Day/night cycle, ambient animations

## Deploy Your Own

### One-click deploy:
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/spockthegreatbot/agent-arena)

### Self-host (recommended for real data):
```bash
git clone https://github.com/spockthegreatbot/agent-arena.git
cd agent-arena
npm install
# Edit src/lib/agents.ts to customize your agent names, colors, roles
npm run build
PORT=4001 npm start
```

### Customize your agents:
Edit `src/lib/agents.ts` — change agent names, emojis, colors, roles, and desk positions.

### Connect to OpenClaw:
If you run OpenClaw, agent status is read automatically from `~/.openclaw/agents/`. 
Without OpenClaw, the arena runs in demo mode with sample data.

## Configuration
- `ARENA_MODE=live|demo` — force live or demo mode
- `OPENCLAW_HOME=~/.openclaw` — path to OpenClaw data directory
- `PORT=4001` — server port

## Screenshots
[Add screenshots here]

## Built with
- Next.js 15 + TypeScript + Tailwind
- HTML5 Canvas (no external rendering libraries)
- OpenClaw for agent orchestration

## License
MIT
