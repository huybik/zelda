// File: src/systems/tradingSystem.ts
import { Character } from "../entities/character";
import { InventoryItem } from "../core/utils";
import { Game } from "../main";

export class TradingSystem {
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initiates and executes a trade between two characters if conditions are met.
   * @param initiator The character initiating the trade.
   * @param target The character receiving the trade proposal.
   * @param itemsToGive An array of items the initiator wants to give.
   * @param itemsToReceive An array of items the initiator wants to receive.
   * @returns True if the trade was successful, false otherwise.
   */
  initiateTrade(
    initiator: Character,
    target: Character,
    itemsToGive: InventoryItem[],
    itemsToReceive: InventoryItem[]
  ): boolean {
    // --- Basic Checks ---
    if (
      !initiator ||
      !target ||
      initiator === target ||
      initiator.isDead ||
      target.isDead ||
      !initiator.inventory ||
      !target.inventory
    ) {
      console.warn("Trade failed: Invalid participants or inventories.");
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (invalid participants).`,
        target,
        { reason: "Invalid participants" },
        initiator.mesh?.position
      );
      return false;
    }

    // --- Item Validation ---
    // Ensure item arrays are valid
    const validGiveItems =
      itemsToGive?.filter((item) => item && item.count > 0) ?? [];
    const validReceiveItems =
      itemsToReceive?.filter((item) => item && item.count > 0) ?? [];

    if (validGiveItems.length === 0 && validReceiveItems.length === 0) {
      console.warn("Trade failed: No items specified for trade.");
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (no items specified).`,
        target,
        { reason: "No items specified" },
        initiator.mesh?.position
      );
      return false;
    }

    // --- Check Item Availability ---
    if (!initiator.inventory.hasItems(validGiveItems)) {
      console.warn(
        `Trade failed: Initiator (${initiator.name}) does not have required items to give.`
      );
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (initiator lacks items).`,
        target,
        { reason: "Initiator lacks items", items: validGiveItems },
        initiator.mesh?.position
      );
      return false;
    }

    if (!target.inventory.hasItems(validReceiveItems)) {
      console.warn(
        `Trade failed: Target (${target.name}) does not have required items to receive.`
      );
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (target lacks items).`,
        target,
        { reason: "Target lacks items", items: validReceiveItems },
        initiator.mesh?.position
      );
      return false;
    }

    // --- Simulate Item Transfer to Check Space ---
    // This is a simplified check. A more robust system might temporarily reserve slots.
    let initiatorCanReceive = true;
    for (const item of validReceiveItems) {
      // Check if adding this item would exceed inventory capacity
      // This is an approximation; doesn't account for stacking perfectly
      const currentCount = initiator.inventory.countItem(item.id);
      const maxStack = initiator.inventory.getMaxStack(item.id);
      const remainingSpaceInStacks = initiator.inventory.items.reduce(
        (space, slot) => {
          if (slot?.id === item.id) {
            return space + (maxStack - slot.count);
          }
          return space;
        },
        0
      );
      const emptySlots = initiator.inventory.items.filter(
        (slot) => slot === null
      ).length;
      const potentialSpace = remainingSpaceInStacks + emptySlots * maxStack;

      if (item.count > potentialSpace) {
        initiatorCanReceive = false;
        break;
      }
    }

    let targetCanReceive = true;
    for (const item of validGiveItems) {
      const currentCount = target.inventory.countItem(item.id);
      const maxStack = target.inventory.getMaxStack(item.id);
      const remainingSpaceInStacks = target.inventory.items.reduce(
        (space, slot) => {
          if (slot?.id === item.id) {
            return space + (maxStack - slot.count);
          }
          return space;
        },
        0
      );
      const emptySlots = target.inventory.items.filter(
        (slot) => slot === null
      ).length;
      const potentialSpace = remainingSpaceInStacks + emptySlots * maxStack;

      if (item.count > potentialSpace) {
        targetCanReceive = false;
        break;
      }
    }

    if (!initiatorCanReceive) {
      console.warn(
        `Trade failed: Initiator (${initiator.name}) does not have enough inventory space.`
      );
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (initiator inventory full).`,
        target,
        { reason: "Initiator inventory full", items: validReceiveItems },
        initiator.mesh?.position
      );
      return false;
    }

    if (!targetCanReceive) {
      console.warn(
        `Trade failed: Target (${target.name}) does not have enough inventory space.`
      );
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (target inventory full).`,
        target,
        { reason: "Target inventory full", items: validGiveItems },
        initiator.mesh?.position
      );
      return false;
    }

    // --- Execute Trade ---
    // Remove items from initiator
    for (const item of validGiveItems) {
      if (!initiator.inventory.removeItem(item.id, item.count)) {
        // This should ideally not happen due to the hasItems check, but handle defensively
        console.error(
          `Trade execution error: Failed to remove ${item.count}x ${item.id} from ${initiator.name}`
        );
        // Rollback? For simplicity, we'll proceed but log the error.
      }
    }

    // Remove items from target
    for (const item of validReceiveItems) {
      if (!target.inventory.removeItem(item.id, item.count)) {
        console.error(
          `Trade execution error: Failed to remove ${item.count}x ${item.id} from ${target.name}`
        );
        // Rollback?
      }
    }

    // Add items to target
    for (const item of validGiveItems) {
      target.inventory.addItem(item.id, item.count);
    }

    // Add items to initiator
    for (const item of validReceiveItems) {
      initiator.inventory.addItem(item.id, item.count);
    }

    // --- Log Success ---
    const formatItems = (items: InventoryItem[]) =>
      items.map((i) => `${i.count}x ${i.name}`).join(", ") || "nothing";
    const logMessage = `${initiator.name} traded [${formatItems(validGiveItems)}] to ${target.name} for [${formatItems(validReceiveItems)}].`;
    console.log(`Trade successful: ${logMessage}`);
    this.game.logEvent(
      initiator,
      "trade_success",
      logMessage,
      target,
      {
        gave: validGiveItems,
        received: validReceiveItems,
      },
      initiator.mesh?.position
    );
    // Also log from target's perspective if they are an NPC
    if (target.aiController) {
      this.game.logEvent(
        target,
        "trade_success",
        `Received [${formatItems(validGiveItems)}] from ${initiator.name} for [${formatItems(validReceiveItems)}].`,
        initiator,
        {
          gave: validReceiveItems, // Target gave these
          received: validGiveItems, // Target received these
        },
        target.mesh?.position
      );
    }

    return true;
  }
}
