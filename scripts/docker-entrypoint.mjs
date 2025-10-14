#!/usr/bin/env node

/**
 * Docker entrypoint script for trading agents
 *
 * This script runs before npm start to ensure the database is properly initialized.
 * It handles the ElizaOS 1.6.1 requirement where agent records must exist before
 * entity creation to satisfy foreign key constraints.
 *
 * Flow:
 * 1. Check if database needs initialization
 * 2. Run setup-agent-db.mjs if needed
 * 3. Start the agent with npm start
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    const timestamp = new Date().toISOString();
    console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

/**
 * Check if database initialization is needed
 */
function needsInitialization() {
    const AGENT_CHARACTER = process.env.AGENT_CHARACTER || 'pamela';
    const DB_SUFFIX = AGENT_CHARACTER ? `-${AGENT_CHARACTER}` : '';
    const DB_DIR = process.env.PGLITE_DATA_DIR || join(__dirname, `../.eliza/.elizadb${DB_SUFFIX}`);

    // If database directory doesn't exist or is empty, we need initialization
    if (!existsSync(DB_DIR)) {
        log(`Database directory does not exist: ${DB_DIR}`, 'yellow');
        return true;
    }

    // Check if database has any files (even empty db has some files)
    try {
        const files = execSync(`find "${DB_DIR}" -type f 2>/dev/null | wc -l`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        const fileCount = parseInt(files);
        if (fileCount === 0) {
            log('Database directory is empty', 'yellow');
            return true;
        }

        log(`Database exists with ${fileCount} files`, 'cyan');
        return false;
    } catch (error) {
        log(`Could not check database files: ${error.message}`, 'yellow');
        // Assume we need initialization if we can't check
        return true;
    }
}

/**
 * Run the setup-agent-db script
 */
function runDatabaseSetup() {
    log('═══════════════════════════════════════════════════════', 'magenta');
    log('  Database Initialization', 'magenta');
    log('═══════════════════════════════════════════════════════', 'magenta');

    const setupScript = join(__dirname, 'setup-agent-db.mjs');

    if (!existsSync(setupScript)) {
        log(`Setup script not found: ${setupScript}`, 'red');
        log('Continuing without database initialization - agent may fail to start', 'yellow');
        return false;
    }

    try {
        log('Running database setup...', 'cyan');
        execSync(`node "${setupScript}"`, {
            cwd: join(__dirname, '..'),
            stdio: 'inherit',
            env: process.env
        });

        log('✓ Database initialization completed successfully', 'green');
        return true;
    } catch (error) {
        log(`✗ Database setup failed: ${error.message}`, 'red');
        log('Continuing anyway - agent may fail to start', 'yellow');
        return false;
    }
}

/**
 * Start the agent application
 */
function startAgent() {
    log('═══════════════════════════════════════════════════════', 'magenta');
    log('  Starting Agent', 'magenta');
    log('═══════════════════════════════════════════════════════', 'magenta');

    const agentName = process.env.AGENT_NAME || 'Agent';
    const agentCharacter = process.env.AGENT_CHARACTER || 'pamela';
    log(`Agent: ${agentName} (${agentCharacter})`, 'cyan');
    log('Command: npm start', 'cyan');

    // Use spawn to start npm and inherit stdio so we see all output
    // Set ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS to avoid migration blocks
    const agent = spawn('npm', ['start'], {
        cwd: join(__dirname, '..'),
        stdio: 'inherit',
        env: {
            ...process.env,
            ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS: 'true'
        }
    });

    // Forward signals to the agent process
    process.on('SIGTERM', () => {
        log('Received SIGTERM, forwarding to agent...', 'yellow');
        agent.kill('SIGTERM');
    });

    process.on('SIGINT', () => {
        log('Received SIGINT, forwarding to agent...', 'yellow');
        agent.kill('SIGINT');
    });

    // Exit with the same code as the agent
    agent.on('exit', (code, signal) => {
        if (signal) {
            log(`Agent killed by signal ${signal}`, 'yellow');
            process.exit(1);
        } else {
            log(`Agent exited with code ${code}`, code === 0 ? 'green' : 'red');
            process.exit(code);
        }
    });
}

/**
 * Main entrypoint
 */
async function main() {
    log('═══════════════════════════════════════════════════════', 'magenta');
    log('  Trading Agent - Docker Entrypoint', 'magenta');
    log('═══════════════════════════════════════════════════════', 'magenta');

    // Show environment info
    const agentId = process.env.AGENT_ID || 'not set';
    const agentCharacter = process.env.AGENT_CHARACTER || 'pamela';
    const gitTag = process.env.GIT_TAG || 'not set';

    log(`Agent ID: ${agentId}`, 'cyan');
    log(`Character: ${agentCharacter}`, 'cyan');
    log(`Git Tag: ${gitTag}`, 'cyan');
    log('', 'reset');

    // Check if database needs initialization
    if (needsInitialization()) {
        log('Database initialization required', 'yellow');
        runDatabaseSetup();
        log('', 'reset');
    } else {
        log('✓ Database already initialized', 'green');
        log('', 'reset');
    }

    // Start the agent
    startAgent();
}

// Run the entrypoint
main().catch(error => {
    log(`Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
