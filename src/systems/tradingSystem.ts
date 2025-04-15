/* File: /src/systems/tradingSystem.ts */
// File: src/systems/tradingSystem.ts
import { Character } from "../entities/character";
import { InventoryItem } from "../core/utils";
import { Game } from "../main";
import { Vector3 } from "three";

export class TradingSystem {
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  /**
   * Initiates the UI prompt for a trade offer.
   * Called by the AI when it decides to trade.
   * @param initiator The character initiating the trade (NPC).
   * @param target The character receiving the trade proposal (Player).
   * @param itemsToGive An array of items the initiator wants to give.
   * @param itemsToReceive An array of items the initiator wants to receive.
   */
  requestTradeUI(
    initiator: Character,
    target: Character,
    itemsToGive: InventoryItem[],
    itemsToReceive: InventoryItem[]
  ): void {
    if (
      !initiator ||
      !target ||
      initiator === target ||
      initiator.isDead ||
      target.isDead ||
      !initiator.inventory ||
      !target.inventory ||
      target !== this.game.activeCharacter // Ensure target is the active player
    ) {
      console.warn("Trade UI request failed: Invalid participants.");
      this.game.logEvent(
        initiator,
        "trade_request_fail",
        `Trade request to ${target.name} failed (invalid participants).`,
        target,
        { reason: "Invalid participants" },
        initiator.mesh?.position
      );
      return;
    }

    // Trigger the UI notification via the Game class
    this.game.showTradeNotification(
      initiator,
      target,
      itemsToGive,
      itemsToReceive
    );
  }

  /**
   * Executes the actual trade after the player accepts.
   * Performs final checks for item availability and inventory space.
   * @param initiator The character who initiated the trade (NPC).
   * @param target The character who accepted the trade (Player).
   * @param itemsToGive Items the initiator will give.
   * @param itemsToReceive Items the initiator will receive.
   * @returns True if the trade was successful, false otherwise.
   */
  executeTrade(
    initiator: Character,
    target: Character,
    itemsToGive: InventoryItem[],
    itemsToReceive: InventoryItem[]
  ): boolean {
    // --- Re-validate Participants and Inventories ---
    if (
      !initiator ||
      !target ||
      initiator === target ||
      initiator.isDead ||
      target.isDead ||
      !initiator.inventory ||
      !target.inventory
    ) {
      console.warn("Trade execution failed: Invalid participants.");
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (invalid participants at execution).`,
        target,
        { reason: "Invalid participants at execution" },
        initiator.mesh?.position
      );
      return false;
    }

    // --- Item Validation ---
    const validGiveItems =
      itemsToGive?.filter((item) => item && item.count > 0) ?? [];
    const validReceiveItems =
      itemsToReceive?.filter((item) => item && item.count > 0) ?? [];

    if (validGiveItems.length === 0 && validReceiveItems.length === 0) {
      console.warn("Trade execution failed: No items specified.");
      // No need to log again if request was already logged
      return false;
    }

    // --- Final Check: Item Availability ---
    if (!initiator.inventory.hasItems(validGiveItems)) {
      console.warn(
        `Trade execution failed: Initiator (${initiator.name}) lacks items.`
      );
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (initiator lacked items at execution).`,
        target,
        {
          reason: "Initiator lacked items at execution",
          items: validGiveItems,
        },
        initiator.mesh?.position
      );
      // Notify player UI?
      this.game.notificationManager?.createItemAddedSprite(
        "Trade Failed", // Use a generic ID or message
        0, // Count 0 indicates failure message
        target.mesh!.position.clone().add(new Vector3(0, 1, 0))
      );
      return false;
    }

    if (!target.inventory.hasItems(validReceiveItems)) {
      console.warn(
        `Trade execution failed: Target (${target.name}) lacks items.`
      );
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (target lacked items at execution).`,
        target,
        {
          reason: "Target lacked items at execution",
          items: validReceiveItems,
        },
        initiator.mesh?.position
      );
      // Notify player UI
      this.game.notificationManager?.createItemAddedSprite(
        "Trade Failed",
        0,
        target.mesh!.position.clone().add(new Vector3(0, 1, 0))
      );
      return false;
    }

    // --- Final Check: Inventory Space (Simplified) ---
    // This check remains simplified. A full check is complex.
    let initiatorCanReceive = true; // Check if initiator (NPC) has space for itemsToReceive
    for (const item of validReceiveItems) {
      if (!this.canInventoryHold(initiator.inventory, item.id, item.count)) {
        initiatorCanReceive = false;
        break;
      }
    }

    let targetCanReceive = true; // Check if target (Player) has space for itemsToGive
    for (const item of validGiveItems) {
      if (!this.canInventoryHold(target.inventory, item.id, item.count)) {
        targetCanReceive = false;
        break;
      }
    }

    if (!initiatorCanReceive) {
      console.warn(
        `Trade execution failed: Initiator (${initiator.name}) inventory full.`
      );
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (initiator inventory full at execution).`,
        target,
        {
          reason: "Initiator inventory full at execution",
          items: validReceiveItems,
        },
        initiator.mesh?.position
      );
      this.game.notificationManager?.createItemAddedSprite(
        "Trade Failed",
        0,
        target.mesh!.position.clone().add(new Vector3(0, 1, 0))
      );
      return false;
    }

    if (!targetCanReceive) {
      console.warn(
        `Trade execution failed: Target (${target.name}) inventory full.`
      );
      this.game.logEvent(
        initiator,
        "trade_fail",
        `Trade with ${target.name} failed (target inventory full at execution).`,
        target,
        { reason: "Target inventory full at execution", items: validGiveItems },
        initiator.mesh?.position
      );
      this.game.notificationManager?.createItemAddedSprite(
        "Trade Failed",
        0,
        target.mesh!.position.clone().add(new Vector3(0, 1, 0))
      );
      return false;
    }

    // --- Execute Trade ---
    // Remove items from initiator
    for (const item of validGiveItems) {
      if (!initiator.inventory.removeItem(item.id, item.count)) {
        console.error(
          `Trade execution error: Failed to remove ${item.count}x ${item.id} from ${initiator.name}`
        );
        // Consider rollback logic here in a more complex system
        return false; // Fail the trade if removal fails
      }
    }

    // Remove items from target (Player) - show notifications
    for (const item of validReceiveItems) {
      if (!target.inventory.removeItem(item.id, item.count)) {
        console.error(
          `Trade execution error: Failed to remove ${item.count}x ${item.id} from ${target.name}`
        );
        // Rollback items given by initiator?
        // For simplicity, fail the trade here.
        // Add back items removed from initiator:
        for (const itemToRestore of validGiveItems) {
          initiator.inventory.addItem(itemToRestore.id, itemToRestore.count);
        }
        return false;
      } else {
        // Show item removed notification for the player
        this.game.notificationManager?.createItemRemovedSprite(
          item.id,
          item.count,
          target.mesh!.position.clone().add(new Vector3(0, 1, 0))
        );
      }
    }

    // Add items to target (Player) - show notifications
    for (const item of validGiveItems) {
      const addResult = target.inventory.addItem(item.id, item.count);
      if (addResult.totalAdded > 0) {
        this.game.notificationManager?.createItemAddedSprite(
          item.id,
          addResult.totalAdded, // Show how many were actually added
          target.mesh!.position.clone().add(new Vector3(0, 1, 0))
        );
      }
      // Handle case where adding fails despite space check (should be rare)
      if (addResult.totalAdded < item.count) {
        console.error(
          `Trade execution error: Failed to add all ${item.count}x ${item.id} to ${target.name}`
        );
        // Rollback? Very complex. Log and potentially leave partial trade.
      }
    }

    // Add items to initiator (NPC) - no notifications needed
    for (const item of validReceiveItems) {
      initiator.inventory.addItem(item.id, item.count);
      // Handle potential add failure for NPC?
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
    // Also log from target's perspective
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

    return true;
  }

  /**
   * Handles the logic when a player declines a trade offer.
   * @param initiator The character who initiated the trade (NPC).
   * @param target The character who declined the trade (Player).
   */
  declineTrade(initiator: Character, target: Character): void {
    if (!initiator || !target) return;

    const message = `${target.name} declined trade offer from ${initiator.name}.`;
    console.log(message);
    this.game.logEvent(
      target, // Logged from player's perspective
      "trade_decline",
      message,
      initiator,
      {},
      target.mesh?.position
    );
    // Log from NPC perspective as well
    this.game.logEvent(
      initiator,
      "trade_decline",
      `${target.name} declined the trade offer.`,
      target,
      {},
      initiator.mesh?.position
    );

    // Optionally trigger NPC reaction logic here or via event log check
    // initiator.aiController?.handleTradeDeclined();
  }

  /**
   * Simplified check if an inventory can potentially hold a given item count.
   * Does not perfectly account for stack merging vs new slots.
   */
  private canInventoryHold(
    inventory: Character["inventory"],
    itemId: string,
    count: number
  ): boolean {
    if (!inventory) return false;
    const maxStack = inventory.getMaxStack(itemId);
    let remainingCount = count;

    // Check space in existing stacks
    for (const slot of inventory.items) {
      if (slot?.id === itemId && slot.count < maxStack) {
        remainingCount -= maxStack - slot.count;
        if (remainingCount <= 0) return true;
      }
    }

    // Check empty slots
    for (const slot of inventory.items) {
      if (slot === null) {
        remainingCount -= maxStack;
        if (remainingCount <= 0) return true;
      }
    }

    return remainingCount <= 0;
  }
}
