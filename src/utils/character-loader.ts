import { type Character } from "@elizaos/core";
import fs from "fs";
import path from "path";
import { getCharacter, pamela as defaultCharacter } from "../characters/index.js";

/**
 * Load agent character configuration with fallback support
 *
 * Priority order:
 * 1. /app/config.json (SPMC injected config)
 * 2. agents/<name>/agent-config.json (legacy monorepo structure)
 * 3. src/characters/ registry (new character registry)
 * 4. Default character (pamela)
 */
export async function loadCharacter(): Promise<Character> {
  // Priority 1: Check for SPMC injected config at /app/config.json
  const spmcConfigPath = process.env.CONFIG_PATH || "/app/config.json";
  if (fs.existsSync(spmcConfigPath)) {
    try {
      const configData = fs.readFileSync(spmcConfigPath, "utf-8");
      const config = JSON.parse(configData);

      if (config.character) {
        console.log(`✓ Loaded character from SPMC config: ${spmcConfigPath}`);
        return buildCharacterFromConfig(config.character);
      }

      // Config exists but no character definition - try loading by name
      if (config.agent_character) {
        const registryChar = getCharacter(config.agent_character);
        if (registryChar) {
          console.log(`✓ Loaded character '${config.agent_character}' from registry (via SPMC config)`);
          return registryChar;
        }
      }
    } catch (error) {
      console.warn(`Failed to load SPMC config from ${spmcConfigPath}:`, error);
    }
  }

  // Priority 2: Check for agent-specific config (legacy monorepo)
  const agentName = process.env.AGENT_CHARACTER || "pamela";
  const legacyConfigPath = path.join(process.cwd(), "agents", agentName, "agent-config.json");

  if (fs.existsSync(legacyConfigPath)) {
    try {
      const configData = fs.readFileSync(legacyConfigPath, "utf-8");
      const config = JSON.parse(configData);
      console.log(`✓ Loaded character from legacy config: ${legacyConfigPath}`);
      return buildCharacterFromConfig(config);
    } catch (error) {
      console.warn(`Failed to load legacy config from ${legacyConfigPath}:`, error);
    }
  }

  // Priority 3: Load from character registry
  const registryChar = getCharacter(agentName);
  if (registryChar) {
    console.log(`✓ Loaded character '${agentName}' from registry`);
    return registryChar;
  }

  // Priority 4: Default to pamela
  console.log(`⚠ No character found for '${agentName}', using default (pamela)`);
  return defaultCharacter;
}

/**
 * Build a Character object from config JSON
 */
function buildCharacterFromConfig(config: any): Character {
  return {
    id: config.id as `${string}-${string}-${string}-${string}-${string}`,
    name: config.name,
    plugins: [],
    settings: config.settings || {
      secrets: {},
      avatar: "https://elizaos.github.io/eliza-avatars/Eliza/portrait.png",
      autoJoinChannels: true,
    },
    system: config.system,
    bio: config.bio || [],
    topics: config.topics || [],
    adjectives: config.adjectives || [],
    style: config.style || {
      all: [],
      chat: [],
      post: [],
    },
    messageExamples: config.messageExamples || [],
  };
}

/**
 * Validate character configuration
 */
export function validateCharacter(character: Character): void {
  if (!character.id) {
    throw new Error("Character must have an id");
  }
  if (!character.name) {
    throw new Error("Character must have a name");
  }
  if (!character.system) {
    throw new Error("Character must have a system prompt");
  }

  // Validate UUID format (ElizaOS standard: 5 dash-separated segments)
  // ElizaOS UUID type: `${string}-${string}-${string}-${string}-${string}`
  // Accepts both RFC 4122 UUIDs and test IDs like "test-123-4567-8901-234567890123"
  const uuidRegex = /^[^-]+-[^-]+-[^-]+-[^-]+-[^-]+$/;
  if (!uuidRegex.test(character.id)) {
    throw new Error(`Invalid character ID format: ${character.id}. Must be 5 dash-separated segments (e.g., "abc-123-def-456-789")`);
  }

  // CRITICAL: Validate that loaded character ID matches AGENT_ID if provided
  // This prevents using hardcoded character IDs when SPMC provides custom IDs
  const envAgentId = process.env.AGENT_ID;
  if (envAgentId && envAgentId !== character.id) {
    console.warn('═══════════════════════════════════════════════════════');
    console.warn('  ⚠ WARNING: Character ID Mismatch Detected');
    console.warn('═══════════════════════════════════════════════════════');
    console.warn(`Environment AGENT_ID:  ${envAgentId}`);
    console.warn(`Loaded Character ID:   ${character.id}`);
    console.warn('');
    console.warn('This may cause database constraint violations!');
    console.warn('The agent will use the loaded character ID.');
    console.warn('═══════════════════════════════════════════════════════');
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`✓ Character Loaded: ${character.name}`);
  console.log(`  ID: ${character.id}`);
  if (envAgentId && envAgentId === character.id) {
    console.log(`  ✓ Matches AGENT_ID environment variable`);
  }
  console.log('═══════════════════════════════════════════════════════');
}
