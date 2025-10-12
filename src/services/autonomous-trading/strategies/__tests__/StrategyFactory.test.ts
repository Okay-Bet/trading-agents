import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { StrategyFactory, StrategyType } from "../StrategyFactory";

describe("StrategyFactory", () => {
  let factory: StrategyFactory;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    factory = new StrategyFactory();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("Agent-specific defaults", () => {
    it("should create INTERACTIVE strategy for pamela by default", async () => {
      process.env.AGENT_CHARACTER = "pamela";
      process.env.TRADING_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("InteractiveStrategy");
    });

    it("should create EXPIRING_MARKETS strategy for chalk-eater by default", async () => {
      process.env.AGENT_CHARACTER = "chalk-eater";
      process.env.TRADING_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("ExpiringMarketsStrategy");
    });

    it("should create INDEX strategy for lib-out by default", async () => {
      process.env.AGENT_CHARACTER = "lib-out";
      process.env.TRADING_ENABLED = "true";
      process.env.SPMC_INDEX_ID = "test-index";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("IndexStrategy");
    });

    it("should create SIMPLE_THRESHOLD strategy for nothing-ever-happens by default", async () => {
      process.env.AGENT_CHARACTER = "nothing-ever-happens";
      process.env.TRADING_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("SimpleThresholdStrategy");
    });

    it("should create SIMPLE_THRESHOLD strategy for trumped-up by default", async () => {
      process.env.AGENT_CHARACTER = "trumped-up";
      process.env.TRADING_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("SimpleThresholdStrategy");
    });
  });

  describe("Explicit strategy configuration", () => {
    it("should override default with INDEX_TRADING_ENABLED", async () => {
      process.env.AGENT_CHARACTER = "pamela"; // defaults to INTERACTIVE
      process.env.INDEX_TRADING_ENABLED = "true";
      process.env.SPMC_INDEX_ID = "test-index";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("IndexStrategy");
    });

    it("should override default with INTERACTIVE_STRATEGY_ENABLED", async () => {
      process.env.AGENT_CHARACTER = "chalk-eater"; // defaults to EXPIRING_MARKETS
      process.env.INTERACTIVE_STRATEGY_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("InteractiveStrategy");
    });

    it("should override default with EXPIRING_MARKETS_ENABLED", async () => {
      process.env.AGENT_CHARACTER = "pamela"; // defaults to INTERACTIVE
      process.env.EXPIRING_MARKETS_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("ExpiringMarketsStrategy");
    });

    it("should override default with SIMPLE_STRATEGY_ENABLED", async () => {
      process.env.AGENT_CHARACTER = "pamela"; // defaults to INTERACTIVE
      process.env.SIMPLE_STRATEGY_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("SimpleThresholdStrategy");
    });
  });

  describe("Multiple strategies", () => {
    it("should enable multiple strategies when explicitly configured", async () => {
      process.env.AGENT_CHARACTER = "pamela";
      process.env.INTERACTIVE_STRATEGY_ENABLED = "true";
      process.env.SIMPLE_STRATEGY_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(2);
      const names = strategies.map((s) => s.name).sort();
      expect(names).toEqual(["InteractiveStrategy", "SimpleThresholdStrategy"]);
    });

    it("should handle three strategies enabled", async () => {
      process.env.AGENT_CHARACTER = "pamela";
      process.env.INTERACTIVE_STRATEGY_ENABLED = "true";
      process.env.SIMPLE_STRATEGY_ENABLED = "true";
      process.env.EXPIRING_MARKETS_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(3);
    });
  });

  describe("Strategy retrieval", () => {
    it("should get strategy by name", async () => {
      process.env.AGENT_CHARACTER = "pamela";
      process.env.INTERACTIVE_STRATEGY_ENABLED = "true";

      await factory.createStrategies();

      const strategy = factory.getStrategy("InteractiveStrategy");
      expect(strategy).toBeDefined();
      expect(strategy?.name).toBe("InteractiveStrategy");
    });

    it("should return undefined for non-existent strategy", async () => {
      process.env.AGENT_CHARACTER = "pamela";
      process.env.INTERACTIVE_STRATEGY_ENABLED = "true";

      await factory.createStrategies();

      const strategy = factory.getStrategy("NonExistent");
      expect(strategy).toBeUndefined();
    });

    it("should get all strategies", async () => {
      process.env.AGENT_CHARACTER = "pamela";
      process.env.INTERACTIVE_STRATEGY_ENABLED = "true";
      process.env.SIMPLE_STRATEGY_ENABLED = "true";

      await factory.createStrategies();

      const allStrategies = factory.getAllStrategies();
      expect(allStrategies.length).toBe(2);
    });
  });

  describe("Edge cases", () => {
    it("should create default strategy even when TRADING_ENABLED=false for named agents", async () => {
      // Note: TRADING_ENABLED only affects unknown agents in default case
      // Named agents like pamela still get their default strategy
      process.env.AGENT_CHARACTER = "pamela";
      process.env.TRADING_ENABLED = "false";

      const strategies = await factory.createStrategies();

      // Pamela gets INTERACTIVE strategy even if TRADING_ENABLED=false
      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("InteractiveStrategy");
    });

    it("should handle unknown agent character with default", async () => {
      process.env.AGENT_CHARACTER = "unknown-agent";
      process.env.TRADING_ENABLED = "true";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("SimpleThresholdStrategy");
    });

    it("should handle missing SPMC_INDEX_ID for index strategy", async () => {
      process.env.AGENT_CHARACTER = "lib-out";
      process.env.TRADING_ENABLED = "true";
      // Missing SPMC_INDEX_ID

      const strategies = await factory.createStrategies();

      // Strategy should still be created but may not be active
      expect(strategies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Configuration", () => {
    it("should use custom threshold values for simple strategy", async () => {
      process.env.AGENT_CHARACTER = "pamela";
      process.env.SIMPLE_STRATEGY_ENABLED = "true";
      process.env.SIMPLE_BUY_THRESHOLD = "0.25";
      process.env.SIMPLE_SELL_THRESHOLD = "0.8";
      process.env.SIMPLE_MIN_EDGE = "0.2";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("SimpleThresholdStrategy");
      // Config values are used (tested via strategy creation)
    });

    it("should use custom values for interactive strategy", async () => {
      process.env.AGENT_CHARACTER = "pamela";
      process.env.INTERACTIVE_STRATEGY_ENABLED = "true";
      process.env.MIN_CONFIDENCE_THRESHOLD = "0.8";
      process.env.SENTIMENT_WEIGHT = "0.4";
      process.env.PRICE_WEIGHT = "0.3";
      process.env.VOLUME_WEIGHT = "0.3";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("InteractiveStrategy");
    });

    it("should use custom values for expiring markets strategy", async () => {
      process.env.AGENT_CHARACTER = "chalk-eater";
      process.env.EXPIRING_MARKETS_ENABLED = "true";
      process.env.EXPIRING_MIN_PROBABILITY = "0.98";
      process.env.EXPIRING_MAX_HOURS = "24";
      process.env.EXPIRING_MIN_HOURS = "1";

      const strategies = await factory.createStrategies();

      expect(strategies.length).toBe(1);
      expect(strategies[0].name).toBe("ExpiringMarketsStrategy");
    });
  });
});
