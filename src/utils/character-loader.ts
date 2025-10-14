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
  console.log(`[CharacterLoader] Checking for SPMC config at: ${spmcConfigPath}`);

  if (fs.existsSync(spmcConfigPath)) {
    console.log(`[CharacterLoader] Found SPMC config file`);
    try {
      const configData = fs.readFileSync(spmcConfigPath, "utf-8");
      const config = JSON.parse(configData);
      console.log(`[CharacterLoader] Parsed config successfully`);

      if (config.character) {
        console.log(`[CharacterLoader] Config contains character definition`);
        console.log(`[CharacterLoader] Character ID from config: ${config.character.id}`);
        console.log(`[CharacterLoader] Character name from config: ${config.character.name}`);
        const character = buildCharacterFromConfig(config.character);
        console.log(`✓ Loaded character from SPMC config: ${spmcConfigPath}`);
        console.log(`  Final character ID: ${character.id}`);
        return character;
      }

      // Config exists but no character definition - try loading by name
      console.log(`[CharacterLoader] No character definition in config, checking agent_character field`);
      if (config.agent_character) {
        console.log(`[CharacterLoader] Found agent_character: ${config.agent_character}`);
        const registryChar = getCharacter(config.agent_character);
        if (registryChar) {
          console.log(`✓ Loaded character '${config.agent_character}' from registry (via SPMC config)`);
          console.warn(`⚠ WARNING: Using character registry with hardcoded ID: ${registryChar.id}`);
          console.warn(`⚠ This may not match your AGENT_ID: ${process.env.AGENT_ID}`);
          return registryChar;
        }
        console.log(`[CharacterLoader] Character '${config.agent_character}' not found in registry`);
      }
    } catch (error) {
      console.error(`[CharacterLoader] Failed to load SPMC config from ${spmcConfigPath}:`, error);
    }
  } else {
    console.log(`[CharacterLoader] SPMC config file not found at ${spmcConfigPath}`);
  }

  // Priority 2: Check for agent-specific config (legacy monorepo)
  const agentName = process.env.AGENT_CHARACTER || "pamela";
  const legacyConfigPath = path.join(process.cwd(), "agents", agentName, "agent-config.json");
  console.log(`[CharacterLoader] Checking legacy config at: ${legacyConfigPath}`);

  if (fs.existsSync(legacyConfigPath)) {
    console.log(`[CharacterLoader] Found legacy config file`);
    try {
      const configData = fs.readFileSync(legacyConfigPath, "utf-8");
      const config = JSON.parse(configData);
      console.log(`✓ Loaded character from legacy config: ${legacyConfigPath}`);
      console.log(`  Character ID: ${config.id}`);
      return buildCharacterFromConfig(config);
    } catch (error) {
      console.error(`[CharacterLoader] Failed to load legacy config from ${legacyConfigPath}:`, error);
    }
  } else {
    console.log(`[CharacterLoader] Legacy config not found`);
  }

  // Priority 3: Load from character registry
  console.log(`[CharacterLoader] Attempting to load '${agentName}' from character registry`);
  const registryChar = getCharacter(agentName);
  if (registryChar) {
    console.log(`✓ Loaded character '${agentName}' from registry`);
    console.warn(`⚠ WARNING: Using character registry with hardcoded ID: ${registryChar.id}`);
    console.warn(`⚠ This may not match your AGENT_ID: ${process.env.AGENT_ID}`);
    return registryChar;
  }
  console.log(`[CharacterLoader] Character '${agentName}' not found in registry`);

  // Priority 4: Default to pamela
  console.log(`⚠ No character found for '${agentName}', using default (pamela)`);
  console.warn(`⚠ WARNING: Using default character with hardcoded ID: ${defaultCharacter.id}`);
  console.warn(`⚠ This may not match your AGENT_ID: ${process.env.AGENT_ID}`);
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
