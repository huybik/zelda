/* File: /src/core/questManager.ts */
import { Game } from "../main";
import {
  Quest,
  QuestObjectiveType,
  QuestRewardType,
  InventoryItem,
} from "../core/utils";
import { Character } from "../entities/character";
import { Animal } from "../entities/animals";
import { Profession } from "./items";

export class QuestManager {
  private game: Game;
  public quests: Quest[];

  constructor(game: Game) {
    this.game = game;
    this.quests = [];
  }

  initQuests(): void {
    this.quests = [
      // --- Wood Tycoon ---
      {
        id: "wood_tycoon",
        name: "Wood Tycoon",
        description: `Become a master of lumber! Gather 20 woods.<br>
          Press (J) or tap Journal on mobile to open Journal.`,
        objectives: [
          {
            type: QuestObjectiveType.ITEM_COUNT,
            description: "Have Wood in Inventory",
            targetItemId: "wood",
            requiredCount: 20,
            currentCount: 0,
            isCompleted: false,
          },
        ],
        isCompleted: false,
        rewardType: QuestRewardType.WEAPON_CHOICE, // Example: Choice
        rewardOptions: [
          {
            id: "new_sword",
            name: "New Sword",
            description: "Receive a brand new sword.",
          },
          {
            id: "upgrade_damage",
            name: "Upgrade Damage",
            description:
              "Increase the damage of your currently equipped weapon.",
          },
        ],
        hasBeenNotified: false,
      },
      // --- Wolf Slayer ---
      {
        id: "wolf_slayer",
        name: "Wolf Slayer",
        description:
          "The wolf population is getting out of hand. Thin their numbers.",
        objectives: [
          {
            type: QuestObjectiveType.KILL_COUNT,
            description: "Kill Wolves",
            targetEntityType: "Wolf", // Match Animal.animalType
            requiredCount: 10,
            currentCount: 0,
            isCompleted: false,
          },
        ],
        isCompleted: false,
        rewardType: QuestRewardType.WEAPON_UPGRADE, // Example: Upgrade
        rewardData: 5, // Example: +5 damage upgrade amount
        hasBeenNotified: false,
      },
      // --- You the Boss ---
      {
        id: "you_the_boss",
        name: "You the Boss",
        description:
          "Gain the loyalty of all villagers. Convince them to follow your lead.",
        objectives: [
          {
            type: QuestObjectiveType.MULTI_STATE,
            description: "Villagers Following",
            targetEntityType: "Villager", // Special type to identify NPCs
            targetState: "following", // Check aiState
            requiredCount: 3, // Assuming 3 villagers (Farmer, Blacksmith, Hunter)
            currentCount: 0,
            isCompleted: false,
          },
        ],
        isCompleted: false,
        rewardType: QuestRewardType.ENABLE_MECHANIC,
        rewardData: "character_switching", // Identifier for the mechanic
        hasBeenNotified: false,
      },
      // --- Feed the Farmer ---
      {
        id: "feed_the_farmer",
        name: "The Wolfs want the Farmer",
        description:
          "Farmer Giles looks tasty to the wolf. Lure him into the wilderness.",
        objectives: [
          {
            type: QuestObjectiveType.ENTITY_KILLED_BY,
            description: "Farmer Giles killed by Wolf",
            targetEntityId: "Farmer Giles", // Match Character.name (or use ID if stable)
            targetEntityType: "Wolf", // Killer type
            requiredCount: 1,
            currentCount: 0,
            isCompleted: false,
          },
        ],
        isCompleted: false,
        rewardType: QuestRewardType.ADD_PROFESSION,
        rewardData: Profession.Farmer, // Profession to add
        hasBeenNotified: false,
      },
      // --- Blacksmith Must Die ---
      {
        id: "blacksmith_must_die",
        name: "Blacksmith Must Die",
        description:
          "Blacksmith Brynn stands in your way. Convince the Hunter to help eliminate her.",
        objectives: [
          {
            type: QuestObjectiveType.ENTITY_KILLED_BY,
            description: "Blacksmith Brynn killed by Hunter Rex",
            targetEntityId: "Blacksmith Brynn", // Match Character.name
            targetEntityType: "Hunter Rex", // Killer type (specific character name/ID)
            requiredCount: 1,
            currentCount: 0,
            isCompleted: false,
          },
        ],
        isCompleted: false,
        rewardType: QuestRewardType.ADD_PROFESSION,
        rewardData: Profession.Blacksmith, // Profession to add
        hasBeenNotified: false,
      },
      // --- Trade Mastery ---
      {
        id: "trade_mastery",
        name: "Trade Mastery",
        description:
          "Convince the villagers to part with their resources... for free!",
        objectives: [
          {
            type: QuestObjectiveType.RECEIVE_ITEM_TRADE,
            description: "Receive Wood via Trade",
            targetItemId: "wood",
            requiredCount: 1, // Just need to receive it once
            currentCount: 0,
            isCompleted: false,
          },
          {
            type: QuestObjectiveType.RECEIVE_ITEM_TRADE,
            description: "Receive Stone via Trade",
            targetItemId: "stone",
            requiredCount: 1,
            currentCount: 0,
            isCompleted: false,
          },
          {
            type: QuestObjectiveType.RECEIVE_ITEM_TRADE,
            description: "Receive Herb via Trade",
            targetItemId: "herb",
            requiredCount: 1,
            currentCount: 0,
            isCompleted: false,
          },
        ],
        isCompleted: false,
        rewardType: QuestRewardType.ITEM_REWARD,
        rewardData: { itemId: "coin", count: 10 }, // Reward 10 coins
        hasBeenNotified: false,
      },
    ];

    // Initialize current counts based on initial game state
    this.checkAllQuestsCompletion(true); // Initial check without notifications
  }

  /**
   * Updates the progress of RECEIVE_ITEM_TRADE objectives.
   * Called by TradingSystem upon successful trade where the player received the item for free/minimal cost.
   * @param receivedItemId The ID of the item the player received.
   */
  updateReceiveItemTradeObjective(receivedItemId: string): void {
    let questUpdated = false;
    this.quests.forEach((quest) => {
      if (quest.isCompleted) return;

      quest.objectives.forEach((obj) => {
        if (
          !obj.isCompleted &&
          obj.type === QuestObjectiveType.RECEIVE_ITEM_TRADE &&
          obj.targetItemId === receivedItemId
        ) {
          obj.currentCount = 1; // Mark as received
          obj.isCompleted = true;
          questUpdated = true;
          console.log(
            `Quest '${quest.name}' objective updated: Received ${receivedItemId} via trade.`
          );
        }
      });
    });

    // If any objective was updated, re-check overall quest completion
    if (questUpdated) {
      this.checkAllQuestsCompletion();
    }
  }

  checkAllQuestsCompletion(initialCheck: boolean = false): void {
    if (!this.game.activeCharacter || !this.game.entities) return;

    const player = this.game.activeCharacter;
    const playerInventory = player.inventory;

    this.quests.forEach((quest) => {
      if (quest.isCompleted) return; // Skip already completed quests

      let allObjectivesComplete = true;

      quest.objectives.forEach((obj) => {
        if (obj.isCompleted) return; // Skip already completed objectives

        let currentProgress = obj.currentCount; // Start with existing progress
        let objectiveNowComplete = false;

        switch (obj.type) {
          case QuestObjectiveType.ITEM_COUNT:
            if (playerInventory && obj.targetItemId) {
              currentProgress = playerInventory.countItem(obj.targetItemId);
            }
            break;

          case QuestObjectiveType.KILL_COUNT:
            if (obj.targetEntityType === "Wolf") {
              currentProgress = this.game.wolfKillCount;
            }
            // Add other kill counts if needed
            break;

          case QuestObjectiveType.ENTITY_STATE:
            const targetEntity = this.game.entities.find(
              (e) => e.id === obj.targetEntityId
            ) as Character | undefined;
            if (
              targetEntity?.aiController &&
              targetEntity.aiController.aiState === obj.targetState &&
              targetEntity.aiController.target === player
            ) {
              currentProgress = 1; // State matches for this specific entity
            } else {
              currentProgress = 0;
            }
            break;

          case QuestObjectiveType.MULTI_STATE:
            let matchingEntities = 0;
            this.game.entities.forEach((e) => {
              if (
                e instanceof Character &&
                !e.userData.isPlayer && // Ensure it's an NPC
                e.aiController &&
                e.aiController.aiState === obj.targetState &&
                e.aiController.target === player
              ) {
                matchingEntities++;
              }
            });
            currentProgress = matchingEntities;
            break;

          case QuestObjectiveType.ENTITY_KILLED_BY:
            const victimEntity = this.game.entities.find(
              (e) => e.name === obj.targetEntityId // Using name for now, ID preferred
            ) as Character | Animal | undefined;

            if (victimEntity?.isDead && victimEntity.lastAttacker) {
              const attacker = victimEntity.lastAttacker;
              // Check if attacker type matches (e.g., "Wolf")
              if (
                obj.targetEntityType &&
                attacker instanceof Animal &&
                attacker.animalType === obj.targetEntityType
              ) {
                currentProgress = 1;
              }
              // Check if attacker ID/Name matches (e.g., "Hunter Rex")
              else if (
                obj.targetEntityType && // Using entityType field for specific killer name/ID here
                attacker instanceof Character &&
                attacker.name === obj.targetEntityType
              ) {
                currentProgress = 1;
              } else {
                currentProgress = 0;
              }
            } else {
              currentProgress = 0;
            }
            break;

          case QuestObjectiveType.RECEIVE_ITEM_TRADE:
            // This type is now primarily updated by `updateReceiveItemTradeObjective`
            // We just check its existing state here.
            currentProgress = obj.currentCount;
            break;
        }

        // Update current count and check completion
        obj.currentCount = currentProgress;
        if (obj.currentCount >= obj.requiredCount) {
          if (!obj.isCompleted) {
            // Only mark as newly complete if it wasn't already
            objectiveNowComplete = true;
          }
          obj.isCompleted = true;
        } else {
          obj.isCompleted = false; // Ensure it's false if progress drops
          allObjectivesComplete = false; // If any objective is not complete, the quest is not
        }

        // If an objective was just completed, update the journal if open
        if (objectiveNowComplete && this.game.journalDisplay?.isOpen) {
          this.game.journalDisplay.updateQuests();
        }
      }); // End objectives loop

      // Check overall quest completion
      if (allObjectivesComplete) {
        quest.isCompleted = true;
        if (!quest.hasBeenNotified && !initialCheck) {
          this.game.showQuestCompletionBanner(quest); // Show banner on completion
          quest.hasBeenNotified = true; // Mark as notified
          this.game.logEvent(
            player,
            "quest_complete",
            `Completed quest: ${quest.name}`,
            undefined,
            { quest: quest.name },
            player.mesh!.position
          );
          // Update journal UI if it's open
          if (this.game.journalDisplay?.isOpen) {
            this.game.journalDisplay.updateQuests();
          }
        }
      } else {
        quest.isCompleted = false; // Ensure quest is marked incomplete if objectives aren't met
      }
    }); // End quests loop
  }

  getQuestById(id: string): Quest | undefined {
    return this.quests.find((q) => q.id === id);
  }
}
