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
 *
 * CRITICAL: Entity table uses character.id as entity.id, NOT agent_id!
 * ElizaOS creates entities with entity.id = character.id
 */
async function cleanupEntityRecords(characterId, agentId) {
    const AGENT_CHARACTER = process.env.AGENT_CHARACTER || 'pamela';
    const DB_SUFFIX = AGENT_CHARACTER ? `-${AGENT_CHARACTER}` : '';
    const DB_DIR = process.env.PGLITE_DATA_DIR || join(__dirname, `../.eliza/.elizadb${DB_SUFFIX}`);

    console.log('===========================================');
    console.log('  Entity Cleanup (Pre-Startup)');
    console.log('===========================================');
    console.log(`Character ID (entity.id): ${characterId}`);
    console.log(`Agent ID (agent_id ref): ${agentId || 'not provided'}`);
    console.log(`Database: ${DB_DIR}`);
    console.log('');

    try {
        const db = new PGlite(DB_DIR);
        await db.ready;

        let totalDeleted = 0;

        // CRITICAL FIX: Delete entities by CHARACTER ID (entity.id column)
        // ElizaOS uses character.id as entity.id, not agent_id!
        console.log(`[Cleanup] Deleting entities where entity.id = ${characterId}`);
        const deletedByCharacterId = await db.query(
            `DELETE FROM entities WHERE id = $1 RETURNING id`,
            [characterId]
        );

        if (deletedByCharacterId.rows.length > 0) {
            console.log(`✓ Deleted ${deletedByCharacterId.rows.length} entity(ies) by character ID`);
            totalDeleted += deletedByCharacterId.rows.length;
        } else {
            console.log(`  No entities found with character ID`);
        }

        // Also delete by agent_id reference (belt and suspenders)
        if (agentId && agentId !== characterId) {
            console.log(`[Cleanup] Deleting entities where agent_id = ${agentId}`);
            const deletedByAgentId = await db.query(
                `DELETE FROM entities WHERE agent_id = $1 RETURNING id`,
                [agentId]
            );

            if (deletedByAgentId.rows.length > 0) {
                console.log(`✓ Deleted ${deletedByAgentId.rows.length} entity(ies) by agent_id reference`);
                totalDeleted += deletedByAgentId.rows.length;
            } else {
                console.log(`  No entities found with agent_id reference`);
            }
        }

        if (totalDeleted > 0) {
            console.log(`✓ Total entities cleaned up: ${totalDeleted}`);
        } else {
            console.log(`✓ No existing entities found (clean state)`);
        }

        await db.close();
        console.log('✓ Entity cleanup complete');
        console.log('');
        return true;
    } catch (error) {
        console.error(`✗ Entity cleanup failed: ${error.message}`);
        console.error(error.stack);
        // Don't exit - let agent try to start anyway
        return false;
    }
}

/**
 * Load agent configuration from available sources
 * Returns the character configuration that ElizaOS will actually use
 */
function loadAgentConfig() {
    const AGENT_CHARACTER = process.env.AGENT_CHARACTER || 'pamela';

    console.log('[loadAgentConfig] Loading agent configuration...');
    console.log(`[loadAgentConfig] AGENT_CHARACTER: ${AGENT_CHARACTER}`);
    console.log(`[loadAgentConfig] AGENT_ID: ${process.env.AGENT_ID}`);

    // Priority 1: SPMC injected config
    const spmcConfigPath = process.env.CONFIG_PATH || '/app/config.json';
    console.log(`[loadAgentConfig] Checking SPMC config at: ${spmcConfigPath}`);

    if (existsSync(spmcConfigPath)) {
        console.log('[loadAgentConfig] Found SPMC config file');
        try {
            const configData = readFileSync(spmcConfigPath, 'utf-8');
            const config = JSON.parse(configData);
            console.log('[loadAgentConfig] Parsed SPMC config successfully');

            if (config.character && config.character.id && config.character.name) {
                console.log('[loadAgentConfig] SPMC config contains full character definition');
                console.log(`[loadAgentConfig] Character ID from config: ${config.character.id}`);
                console.log(`[loadAgentConfig] Character name from config: ${config.character.name}`);
                console.log(`✓ Loaded config from SPMC: ${spmcConfigPath}`);

                const characterConfig = {
                    id: config.character.id,
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

                console.log(`[loadAgentConfig] Will use character ID: ${characterConfig.id}`);
                return characterConfig;
            } else if (config.agent_id) {
                // SPMC config with just agent_id - will fall through to character registry
                console.warn('[loadAgentConfig] ⚠ SPMC config missing character definition!');
                console.warn(`[loadAgentConfig] Found agent_id: ${config.agent_id} but no character.id`);
                console.warn('[loadAgentConfig] This may cause ID mismatch issues!');
                process.env.AGENT_ID = config.agent_id; // Set for later use
            }
        } catch (error) {
            console.error(`[loadAgentConfig] Failed to parse SPMC config: ${error.message}`);
        }
    } else {
        console.log('[loadAgentConfig] SPMC config file not found');
    }

    // Priority 2: Legacy monorepo config
    const legacyConfigPath = join(__dirname, `../agents/${AGENT_CHARACTER}/agent-config.json`);
    console.log(`[loadAgentConfig] Checking legacy config at: ${legacyConfigPath}`);

    if (existsSync(legacyConfigPath)) {
        console.log('[loadAgentConfig] Found legacy config file');
        try {
            const configData = readFileSync(legacyConfigPath, 'utf-8');
            const config = JSON.parse(configData);
            console.log(`✓ Loaded config from legacy: ${legacyConfigPath}`);
            console.log(`[loadAgentConfig] Character ID: ${config.id}`);
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
            console.error(`[loadAgentConfig] Failed to parse legacy config: ${error.message}`);
        }
    } else {
        console.log('[loadAgentConfig] Legacy config not found');
    }

    // Priority 3: Character registry (hardcoded IDs!)
    const characterPath = join(__dirname, `../src/characters/${AGENT_CHARACTER}.ts`);
    console.log(`[loadAgentConfig] Checking character registry: ${characterPath}`);
    if (existsSync(characterPath)) {
        console.log(`[loadAgentConfig] Found character file in registry`);
        console.warn('⚠ WARNING: Character registry has HARDCODED IDs!');
        console.warn('⚠ ElizaOS will use hardcoded 885c8140-1f94-4be4-b553-ab5558b4d800');
        console.warn('⚠ This WILL NOT match your AGENT_ID and WILL cause crashes!');
    }

    // Priority 4: Use defaults as fallback
    console.log(`[loadAgentConfig] No config found, using fallback for: ${AGENT_CHARACTER}`);

    // Use AGENT_ID if provided, otherwise use hardcoded Pamela ID
    const agentId = process.env.AGENT_ID || '885c8140-1f94-4be4-b553-ab5558b4d800';

    if (process.env.AGENT_ID && process.env.AGENT_ID !== '885c8140-1f94-4be4-b553-ab5558b4d800') {
        console.log(`[loadAgentConfig] Using AGENT_ID from environment: ${agentId}`);
    } else {
        console.warn('⚠ WARNING: Using hardcoded Pamela ID: 885c8140-1f94-4be4-b553-ab5558b4d800');
        console.warn('⚠ This may not match your intended AGENT_ID!');
    }

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
        // Pass character ID (agentConfig.id) which ElizaOS uses as entity.id
        // Also pass AGENT_ID env var if different
        const envAgentId = process.env.AGENT_ID;
        await cleanupEntityRecords(agentConfig.id, envAgentId);

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