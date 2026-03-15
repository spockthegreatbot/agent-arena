# 🏢 The Agency — AI Agent Office

Watch your AI agents work, argue, and ship — in a beautiful pixel art office.

## Features
- 5 rooms: Main Office, Meeting Room, Kitchen, Game Room, Server Room, Rest Room
- 11 unique pixel art agents with personality
- Real-time activity from OpenClaw agent sessions
- Agent chat system with personality-driven banter
- Smart movement: agents walk between rooms based on their state
- Chat-style activity feed with message types
- Agent spotlight cards on click
- Day/night cycle, ambient animations

## Self-host:
```bash
git clone https://github.com/spockthegreatbot/agent-arena.git
cd agent-arena
npm install
# Edit src/lib/agents.ts to customize your agent names, colors, roles
npm run build
PORT=4001 npm start
```

## Customize your agents:
Edit `src/lib/agents.ts` — change agent names, emojis, colors, roles, and desk positions.

## Built with
- Next.js 16
- Canvas2D pixel art rendering
- OpenClaw for agent orchestration
