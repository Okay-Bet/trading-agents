#!/usr/bin/env node

/**
 * Database setup script to create agent record
 * This resolves the ElizaOS 1.6.1 foreign key constraint issue
 * where entities.agent_id requires agents.id to exist
 *
 * Supports multiple configuration sources:
 * 1. /app/config.json (SPMC injected config)
 * 2. agents/<name>/agent-config.json (legacy monorepo)
 * 3. src/characters/<name>.ts (character registry)
 * 4. Default character (pamela)
 */

import { PGlite } from '@electric-sql/pglite';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Clean up existing entity records to prevent duplicate key errors
 * This must run on EVERY startup, not just during initial DB setup
 */
async function cleanupEntityRecords(agentId) {
    const AGENT_CHARACTER = process.env.AGENT_CHARACTER || 'pamela';
    const DB_SUFFIX = AGENT_CHARACTER ? `-${AGENT_CHARACTER}` : '';
    const DB_DIR = process.env.PGLITE_DATA_DIR || join(__dirname, `../.eliza/.elizadb${DB_SUFFIX}`);

    console.log('===========================================');
    console.log('  Entity Cleanup (Pre-Startup)');
    console.log('===========================================');
    console.log(`Agent ID: ${agentId}`);
    console.log(`Database: ${DB_DIR}`);
    console.log('');

    try {
        const db = new PGlite(DB_DIR);
        await db.ready;

        // CRITICAL: Delete any existing entity with this ID
        // ElizaOS will try to INSERT entity on startup, causing duplicate key error
        // if entity from previous run still exists in database
        const deletedEntities = await db.query(
            `DELETE FROM entities WHERE id = $1 RETURNING id`,
            [agentId]
        );

        if (deletedEntities.rows.length > 0) {
            console.log(`✓ Cleaned up ${deletedEntities.rows.length} existing entity record(s)`);
        } else {
            console.log(`✓ No existing entities found for this agent`);
        }

        await db.close();
        console.log('✓ Entity cleanup complete');
        console.log('');
        return true;
    } catch (error) {
        console.error(`✗ Entity cleanup failed: ${error.message}`);
        // Don't exit - let agent try to start anyway
        return false;
    }
}

/**
 * Load agent configuration from available sources
 */
function loadAgentConfig() {
    const AGENT_CHARACTER = process.env.AGENT_CHARACTER || 'pamela';

    // Priority 1: SPMC injected config
    const spmcConfigPath = process.env.CONFIG_PATH || '/app/config.json';
    if (existsSync(spmcConfigPath)) {
        try {
            const configData = readFileSync(spmcConfigPath, 'utf-8');
            const config = JSON.parse(configData);

            if (config.character && config.character.id && config.character.name) {
                console.log(`✓ Loaded config from SPMC: ${spmcConfigPath}`);
                return {
                    id: config.character.id || config.agent_id,
                    name: config.character.name,
                    system: config.character.system || '',
                    bio: config.character.bio || [],
                    messageExamples: config.character.messageExamples || [],
                    postExamples: config.character.postExamples || [],
                    topics: config.character.topics || [],
                    adjectives: config.character.adjectives || [],
                    knowledge: config.character.knowledge || [],
                    plugins: config.character.plugins || [],
                    settings: config.character.settings || {},
                    style: config.character.style || {}
                };
            } else if (config.agent_id) {
                // SPMC config with just agent_id - fall through to character registry
                console.log(`✓ Found SPMC config with agent_id: ${config.agent_id}`);
                process.env.AGENT_ID = config.agent_id; // Set for later use
            }
        } catch (error) {
            console.warn(`Warning: Could not parse SPMC config: ${error.message}`);
        }
    }

    // Priority 2: Legacy monorepo config
    const legacyConfigPath = join(__dirname, `../agents/${AGENT_CHARACTER}/agent-config.json`);
    if (existsSync(legacyConfigPath)) {
        try {
            const configData = readFileSync(legacyConfigPath, 'utf-8');
            const config = JSON.parse(configData);
            console.log(`✓ Loaded config from legacy: ${legacyConfigPath}`);
            return {
                id: config.id,
                name: config.name,
                system: config.system || '',
                bio: config.bio || [],
                messageExamples: config.messageExamples || [],
                postExamples: config.postExamples || [],
                topics: config.topics || [],
                adjectives: config.adjectives || [],
                knowledge: config.knowledge || [],
                plugins: config.plugins || [],
                settings: config.settings || {},
                style: config.style || {}
            };
        } catch (error) {
            console.warn(`Warning: Could not parse legacy config: ${error.message}`);
        }
    }

    // Priority 3: Character registry
    const characterPath = join(__dirname, `../src/characters/${AGENT_CHARACTER}.ts`);
    if (existsSync(characterPath)) {
        console.log(`✓ Found character in registry: ${characterPath}`);
        console.log('⚠ Character registry requires importing - using default structure');
    }

    // Priority 4: Use defaults as fallback
    console.log(`⚠ Using default character structure for: ${AGENT_CHARACTER}`);
    const agentId = process.env.AGENT_ID || '885c8140-1f94-4be4-b553-ab5558b4d800';
    return {
        id: agentId,
        name: AGENT_CHARACTER.charAt(0).toUpperCase() + AGENT_CHARACTER.slice(1),
        system: `You are ${AGENT_CHARACTER}, a trading agent on Polymarket.`,
        bio: [`Trading agent ${AGENT_CHARACTER}`],
        messageExamples: [],
        postExamples: [],
        topics: ['prediction markets', 'trading'],
        adjectives: ['analytical', 'strategic'],
        knowledge: [],
        plugins: [],
        settings: {},
        style: { all: [], chat: [], post: [] }
    };
}

async function setupAgentDatabase() {
    const AGENT_CHARACTER = process.env.AGENT_CHARACTER || 'pamela';
    const DB_SUFFIX = AGENT_CHARACTER ? `-${AGENT_CHARACTER}` : '';
    const DB_DIR = process.env.PGLITE_DATA_DIR || join(__dirname, `../.eliza/.elizadb${DB_SUFFIX}`);
    const ELIZA_DIR = join(__dirname, '../.eliza');
    
    console.log('===========================================');
    console.log('  Agent Database Setup');
    console.log('===========================================');
    console.log(`Agent: ${AGENT_CHARACTER}`);
    console.log(`Database: ${DB_DIR}`);
    console.log('');
    
    // Ensure .eliza directory exists
    if (!existsSync(ELIZA_DIR)) {
        mkdirSync(ELIZA_DIR, { recursive: true });
        console.log('✓ Created .eliza directory');
    }
    
    // Create database directory
    if (!existsSync(DB_DIR)) {
        mkdirSync(DB_DIR, { recursive: true });
        console.log('✓ Created database directory');
    }
    
    // Load agent config from available sources
    const agentConfig = loadAgentConfig();

    console.log(`Configuring agent: ${agentConfig.name} (${agentConfig.id})`);
    
    try {
        const db = new PGlite(DB_DIR);
        
        // Wait for database to be ready
        await db.ready;
        console.log('✓ Database connection established');
        
        // Create agents table if it doesn't exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS agents (
                id UUID PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(255),
                bio JSONB DEFAULT '[]',
                message_examples JSONB DEFAULT '[]',
                post_examples JSONB DEFAULT '[]',
                topics JSONB DEFAULT '[]',
                adjectives JSONB DEFAULT '[]',
                knowledge JSONB DEFAULT '[]',
                plugins JSONB DEFAULT '[]',
                settings JSONB DEFAULT '{}',
                style JSONB DEFAULT '{}',
                system TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✓ Agents table ready');

        // Create entities table if it doesn't exist (ElizaOS requires this)
        // IMPORTANT: names must be text[] not JSONB to match ElizaOS schema
        await db.query(`
            CREATE TABLE IF NOT EXISTS entities (
                id UUID PRIMARY KEY,
                agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                names text[] DEFAULT '{}'::text[] NOT NULL,
                metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
                UNIQUE (id, agent_id)
            );
        `);
        console.log('✓ Entities table ready');

        // Check if agent exists
        const agentExists = await db.query(
            `SELECT id FROM agents WHERE id = $1`,
            [agentConfig.id]
        );
        
        if (agentExists.rows.length === 0) {
            // Delete any agent with same name but different ID
            const deleted = await db.query(
                `DELETE FROM agents WHERE name = $1 AND id != $2 RETURNING id`,
                [agentConfig.name, agentConfig.id]
            );
            
            if (deleted.rows.length > 0) {
                console.log(`✓ Removed conflicting agent with same name`);
            }
            
            // Create the agent record
            await db.query(`
                INSERT INTO agents (
                    id, name, username, bio, message_examples, 
                    post_examples, topics, adjectives, knowledge, 
                    plugins, settings, style, system
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
                agentConfig.id,
                agentConfig.name,
                agentConfig.name.toLowerCase().replace(/\s+/g, '_'),
                JSON.stringify(agentConfig.bio || []),
                JSON.stringify(agentConfig.messageExamples || []),
                JSON.stringify(agentConfig.postExamples || []),
                JSON.stringify(agentConfig.topics || []),
                JSON.stringify(agentConfig.adjectives || []),
                JSON.stringify(agentConfig.knowledge || []),
                JSON.stringify(agentConfig.plugins || []),
                JSON.stringify(agentConfig.settings || {}),
                JSON.stringify(agentConfig.style || {}),
                agentConfig.system || ''
            ]);
            
            console.log('✓ Agent record created successfully');
        } else {
            console.log('✓ Agent record already exists');
        }
        
        // Verify the agent exists
        const verification = await db.query(
            `SELECT id, name FROM agents WHERE id = $1`,
            [agentConfig.id]
        );

        if (verification.rows.length > 0) {
            console.log(`✓ Verified: Agent "${verification.rows[0].name}" exists in database`);
        }

        await db.close();
        console.log('✓ Database setup complete');
        console.log('');

        // Run entity cleanup to ensure clean state
        await cleanupEntityRecords(agentConfig.id);

        console.log('You can now start your agent with:');
        console.log(`  export AGENT_CHARACTER=${AGENT_CHARACTER} && npm run dev`);

    } catch (error) {
        console.error(`✗ Database setup failed: ${error.message}`);
        process.exit(1);
    }
}

// Export functions for use in other scripts
export { cleanupEntityRecords, loadAgentConfig };

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    setupAgentDatabase().catch(console.error);
}