# Open Brain - Self-Hosted Deployment Specification

## Overview
Self-hosted implementation of Nate Jones's "Open Brain" system - a database-backed AI memory system with universal access via MCP protocol. Replaces vendor-dependent services (Supabase/Slack) with self-hosted Docker infrastructure.

## Target Architecture
- **Database**: PostgreSQL 16 + pgvector for semantic search
- **Capture**: Node.js service handling Signal webhooks + web interface  
- **MCP Server**: HTTP-based MCP server exposing brain to any AI client
- **Integration**: Signal-cli webhook for quick thought capture
- **Access**: Claude Desktop, ChatGPT, Cursor, Claude Code via MCP

## Database Schema

### Main Table: `thoughts`
```sql
CREATE TABLE thoughts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    metadata JSONB DEFAULT '{}',
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX thoughts_embedding_idx ON thoughts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX thoughts_metadata_idx ON thoughts USING gin (metadata);
CREATE INDEX thoughts_created_source_idx ON thoughts (created_at, source);
CREATE INDEX thoughts_content_fts_idx ON thoughts USING gin (to_tsvector('english', content));
```

### Metadata Structure
```json
{
  "people": ["Sarah", "John"],
  "topics": ["career_change", "consulting"], 
  "action_items": ["Follow up with Sarah next week"],
  "urgency": "low|medium|high",
  "type": "conversation_note|decision|insight|meeting|action_item"
}
```

### Search Function
```sql
CREATE OR REPLACE FUNCTION match_thoughts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    thoughts.id,
    thoughts.content,
    thoughts.metadata,
    1 - (thoughts.embedding <=> query_embedding) as similarity,
    thoughts.created_at
  FROM thoughts
  WHERE 1 - (thoughts.embedding <=> query_embedding) > match_threshold
  ORDER BY thoughts.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

## Docker Compose Configuration

### File: `docker-compose.openbrain.yml`
```yaml
version: '3.8'

services:
  openbrain-db:
    image: pgvector/pgvector:pg16
    container_name: openbrain-db
    environment:
      POSTGRES_DB: openbrain
      POSTGRES_USER: openbrain
      POSTGRES_PASSWORD: ${OPENBRAIN_DB_PASSWORD}
      POSTGRES_HOST_AUTH_METHOD: md5
    volumes:
      - openbrain_data:/var/lib/postgresql/data
      - ./openbrain/init.sql:/docker-entrypoint-initdb.d/01-init.sql
    ports:
      - "5433:5432"
    restart: unless-stopped
    networks:
      - openbrain-net

  openbrain-capture:
    build: 
      context: ./openbrain/capture
      dockerfile: Dockerfile
    container_name: openbrain-capture
    environment:
      DATABASE_URL: postgresql://openbrain:${OPENBRAIN_DB_PASSWORD}@openbrain-db:5432/openbrain
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      SIGNAL_WEBHOOK_SECRET: ${SIGNAL_WEBHOOK_SECRET}
      PORT: 3000
    ports:
      - "8084:3000"
    depends_on:
      - openbrain-db
    restart: unless-stopped
    networks:
      - openbrain-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.openbrain-capture.rule=Host(`brain-capture.ntry.home`)"
      - "traefik.http.services.openbrain-capture.loadbalancer.server.port=3000"

  openbrain-mcp:
    build:
      context: ./openbrain/mcp
      dockerfile: Dockerfile
    container_name: openbrain-mcp
    environment:
      DATABASE_URL: postgresql://openbrain:${OPENBRAIN_DB_PASSWORD}@openbrain-db:5432/openbrain
      MCP_ACCESS_KEY: ${MCP_ACCESS_KEY}
      PORT: 3000
    ports:
      - "8085:3000"
    depends_on:
      - openbrain-db
    restart: unless-stopped
    networks:
      - openbrain-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.openbrain-mcp.rule=Host(`brain-mcp.ntry.home`)"
      - "traefik.http.services.openbrain-mcp.loadbalancer.server.port=3000"

volumes:
  openbrain_data:

networks:
  openbrain-net:
    driver: bridge
```

## Service Implementations

### Capture Service (`openbrain/capture/`)

#### `package.json`
```json
{
  "name": "openbrain-capture",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "pgvector": "^0.1.8",
    "dotenv": "^16.3.1",
    "axios": "^1.6.0",
    "cors": "^2.8.5"
  },
  "scripts": {
    "start": "node index.js"
  }
}
```

#### Key Functions Required:
1. **Signal Webhook Handler**
   - Verify webhook signature
   - Extract message content and sender
   - Process thought capture pipeline

2. **Embedding Generation**
   - OpenRouter API integration
   - text-embedding-3-small model
   - 1536-dimension vectors

3. **Metadata Extraction**
   - LLM prompt for structured extraction
   - People, topics, action items, urgency classification
   - gpt-4o-mini via OpenRouter

4. **Database Operations**
   - PostgreSQL connection with pgvector
   - Insert with embedding and metadata
   - Error handling and logging

5. **Signal Response**
   - Format confirmation message
   - Send reply to original thread
   - Show extracted metadata

### MCP Server (`openbrain/mcp/`)

#### `package.json`
```json
{
  "name": "openbrain-mcp",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "pgvector": "^0.1.8",
    "dotenv": "^16.3.1",
    "axios": "^1.6.0"
  },
  "scripts": {
    "start": "node index.js"
  }
}
```

#### MCP Tools Required:
1. **search_thoughts**
   - Input: query (string), threshold (optional float), limit (optional int)
   - Generate query embedding
   - Vector similarity search via match_thoughts function
   - Return ranked results with content and metadata

2. **add_thought** 
   - Input: content (string), source (optional string)
   - Same pipeline as capture service
   - Generate embedding + extract metadata
   - Store in database
   - Return confirmation with extracted metadata

3. **list_recent**
   - Input: days (optional int), source (optional string), limit (optional int)
   - Simple chronological query with filters
   - Return formatted results with timestamps

4. **get_stats**
   - Return thought counts by source, recent activity, top topics
   - Simple analytics for dashboard view

## Signal Integration

### Webhook Configuration
- **Endpoint**: `POST /signal-webhook`
- **Authentication**: HMAC signature validation using SIGNAL_WEBHOOK_SECRET
- **Payload**: Standard signal-cli webhook format
- **Response**: 200 OK with confirmation message

### Signal-CLI Configuration
Configure signal-cli to forward messages from specific phone number or group to webhook endpoint:
```bash
# Add webhook configuration to signal-cli
signal-cli -u +31612927574 send-message --recipient +31610277153 --webhook-url http://brain-capture.ntry.home/signal-webhook
```

## Environment Variables

### Required Secrets
```bash
# Database
OPENBRAIN_DB_PASSWORD=<generate-strong-password>

# OpenRouter API
OPENROUTER_API_KEY=<get-from-openrouter.ai>

# Signal Integration  
SIGNAL_WEBHOOK_SECRET=<generate-random-secret>

# MCP Server
MCP_ACCESS_KEY=<generate-random-access-key>
```

## Deployment Steps

### 1. Environment Setup
```bash
# Create project directory
mkdir -p ~/.openclaw/workspace/openbrain/{capture,mcp}

# Generate secrets
export OPENBRAIN_DB_PASSWORD=$(openssl rand -base64 32)
export SIGNAL_WEBHOOK_SECRET=$(openssl rand -hex 32)
export MCP_ACCESS_KEY=$(openssl rand -hex 32)

# Add to environment
echo "OPENBRAIN_DB_PASSWORD=$OPENBRAIN_DB_PASSWORD" >> ~/.openclaw/workspace/.env
echo "SIGNAL_WEBHOOK_SECRET=$SIGNAL_WEBHOOK_SECRET" >> ~/.openclaw/workspace/.env  
echo "MCP_ACCESS_KEY=$MCP_ACCESS_KEY" >> ~/.openclaw/workspace/.env
```

### 2. Database Initialization
Create `openbrain/init.sql` with schema, indexes, and functions

### 3. Service Implementation
- Build capture service with all required endpoints
- Build MCP server with HTTP transport
- Implement error handling, logging, health checks
- Add Dockerfiles for both services

### 4. Docker Deployment
```bash
# Deploy stack
docker-compose -f docker-compose.openbrain.yml up -d

# Verify services
docker-compose -f docker-compose.openbrain.yml ps
docker logs openbrain-capture
docker logs openbrain-mcp
```

### 5. Signal Integration
Configure signal-cli to forward messages to capture endpoint

### 6. MCP Client Configuration

#### Claude Desktop
```json
{
  "mcpServers": {
    "openbrain": {
      "command": "npx",
      "args": ["mcp-remote", "https://brain-mcp.ntry.home", "--header", "x-brain-key:${MCP_ACCESS_KEY}"]
    }
  }
}
```

#### OpenClaw Integration (Custom Skill)
Create `~/.openclaw/workspace/skills/open-brain/` skill to give Cirrus persistent memory:

**SKILL.md**:
```markdown
---
name: open-brain
description: "Access and search your personal Open Brain knowledge system. Use when you need to remember past conversations, decisions, or context across sessions."
---

# Open Brain Skill

## Overview
Access your self-hosted Open Brain system - a persistent memory that remembers conversations, decisions, and insights across all AI interactions.

## Tools Available
- `brain_search(query)` - Semantic search through all captured thoughts
- `brain_add(content, source="openclaw")` - Save important context for future reference
- `brain_recent(days=7)` - Browse recently captured thoughts
- `brain_stats()` - Overview of your knowledge base

## Usage Patterns
- Search past context: "What did we decide about the SOC automation?"
- Capture decisions: "Remember this architecture choice for the security project"
- Browse recent work: "What have I been thinking about this week?"
- Cross-reference projects: "Find related discussions about Docker security"

Use this skill proactively when context from past sessions would be helpful.
```

**Implementation**: HTTP client wrapping the brain API endpoints, exposing them as native OpenClaw tools.

This enables Cirrus to:
- **Search past conversations and decisions**: "What did we decide about the SOC automation project?"
- **Capture important insights automatically**: "Remember this architecture decision for future reference"  
- **Maintain context across sessions**: No more re-explaining project context every session
- **Cross-reference related work**: Connect current discussions to past analysis
- **Proactive context**: Reference relevant past work without being asked
- **Persistent project memory**: Track long-term project evolution and decisions

#### ChatGPT
Configure in ChatGPT settings → Apps & Connectors with same URL + access key

## OpenClaw Skill Implementation

### Skill Structure
```
~/.openclaw/workspace/skills/open-brain/
├── SKILL.md
├── brain-search
├── brain-add  
├── brain-recent
└── brain-stats
```

### CLI Tool Implementation
Each tool is a Node.js script that makes HTTP requests to the brain API:

**brain-search**:
```bash
#!/usr/bin/env node
// Search thoughts by semantic similarity
// Usage: brain-search "security automation decisions"
// Calls: GET https://brain-mcp.ntry.home/search
```

**brain-add**:
```bash
#!/usr/bin/env node  
// Add new thought to brain
// Usage: brain-add "Decided to use Wazuh for SIEM"
// Calls: POST https://brain-mcp.ntry.home/add
```

**brain-recent**:
```bash
#!/usr/bin/env node
// List recent thoughts
// Usage: brain-recent --days 7
// Calls: GET https://brain-mcp.ntry.home/recent
```

**brain-stats**:
```bash
#!/usr/bin/env node
// Show brain statistics  
// Usage: brain-stats
// Calls: GET https://brain-mcp.ntry.home/stats
```

Each tool includes:
- Authentication via x-brain-key header
- Error handling and user-friendly output
- JSON formatting for structured data
- Proper exit codes for OpenClaw integration

## Migration Scripts

### 1. Memory Files Import
Script to import existing `memory/*.md` files:
- Parse markdown content
- Extract metadata from filenames/content
- Generate embeddings
- Bulk insert to database

### 2. Claude/ChatGPT Memory Export
Prompts to extract existing AI memories and import to Open Brain

## Testing & Validation

### 1. Unit Tests
- Database operations
- Embedding generation
- Metadata extraction
- MCP tool functions

### 2. Integration Tests  
- Signal webhook end-to-end
- MCP client connectivity
- Search accuracy validation

### 3. Performance Tests
- Query response times
- Embedding generation speed
- Concurrent request handling

## Monitoring & Maintenance

### Health Checks
- Database connectivity
- OpenRouter API status
- MCP server responsiveness
- Signal webhook availability

### Logging
- Structured JSON logging
- Request/response tracking
- Error monitoring
- Performance metrics

### Backup Strategy
- Daily PostgreSQL dumps
- Vector data backup
- Configuration backup

## Success Criteria

1. **Capture**: Type thought in Signal → automatic embedding/classification → confirmation reply
2. **Search**: Ask Claude/ChatGPT about past thoughts → semantic search returns relevant results
3. **Universal Access**: Same memory accessible from Claude Desktop, ChatGPT, Cursor, Claude Code
4. **OpenClaw Integration**: Cirrus can search/add thoughts via `brain_search`, `brain_add` tools
5. **Persistent Assistant Memory**: Cirrus references past context without re-explanation
6. **Migration**: Existing memory/ files successfully imported and searchable
7. **Performance**: Sub-2s response time for searches, sub-10s for capture processing

## Future Enhancement: Automatic Context Capture

Consider implementing automatic capture from OpenClaw conversations:
- Hook into OpenClaw's conversation logging
- Auto-extract key decisions, insights, and project updates
- Background processing to avoid interrupting conversations
- Configurable capture rules (capture decisions, skip routine tasks, etc.)

This would eliminate manual "remember this" steps for important context.

## Implementation Priority

1. **Database + Schema** (foundation)
2. **Capture Service** (core functionality)
3. **MCP Server** (universal access)
4. **Signal Integration** (user interface)
5. **OpenClaw Skill** (assistant integration)
6. **Migration Scripts** (existing data)
7. **Client Configuration** (external AI tools)
8. **Monitoring/Health Checks** (operations)

## Notes for Implementation Agent

- Use TypeScript for type safety in both services
- Implement proper error handling and validation
- Add comprehensive logging for debugging
- Follow existing Docker/Traefik patterns in the lab
- Test with small dataset before full migration
- Implement rate limiting on public endpoints
- Add proper CORS configuration
- Use connection pooling for PostgreSQL
- Implement graceful shutdown handling

This specification provides everything needed to implement a fully self-hosted Open Brain system integrated with existing infrastructure.