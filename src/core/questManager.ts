/* File: /src/core/questManager.ts */
import { Game } from "../main";
import { Quest } from "../core/utils";
import { Character } from "../entities/character";

export class QuestManager {
  private game: Game;
  public quests: Quest[];

  constructor(game: Game) {
    this.game = game;
    this.quests = [];
  }

  initQuests(): void {
    this.quests = [
      {
        id: "find_brynn",
        name: "Who is Blacksmith Brynn",
        description: "Find out who Blacksmith Brynn is.",
        isCompleted: false,
        checkCompletion: (target: Character, response: string) => {
          return (
            target.name === "Blacksmith Brynn" &&
            response.toLowerCase().includes("brynn")
          );
        },
      },
      {
        id: "gather_rocks_giles",
        name: "Get Farmer Giles to collect rocks",
        description: "Convince Farmer Giles to collect rocks.",
        isCompleted: false,
        checkCompletion: (target: Character, response: string) => {
          const lowerResponse = response.toLowerCase();
          return (
            target.name === "Farmer Giles" &&
            (lowerResponse.includes("ok") || lowerResponse.includes("agree")) &&
            lowerResponse.includes("rock")
          );
        },
      },
      {
        id: "kill_brynn_rex",
        name: "Convince Hunter Rex to kill Blacksmith Brynn",
        description:
          "Persuade Hunter Rex to take action against Blacksmith Brynn.",
        isCompleted: false,
        checkCompletion: (target: Character, response: string) => {
          const lowerResponse = response.toLowerCase();
          return (
            target.name === "Hunter Rex" &&
            (lowerResponse.includes("ok") || lowerResponse.includes("agree")) &&
            lowerResponse.includes("kill") &&
            lowerResponse.includes("brynn")
          );
        },
      },
    ];
  }

  checkQuestCompletion(
    interactionTarget: Character,
    chatResponse: string
  ): void {
    this.quests.forEach((quest) => {
      if (
        !quest.isCompleted &&
        quest.checkCompletion(interactionTarget, chatResponse)
      ) {
        quest.isCompleted = true;
        this.game.showQuestBanner(quest, true); // Show banner on completion
        this.game.logEvent(
          interactionTarget,
          "quest_complete",
          `Completed quest: ${quest.name}`,
          undefined,
          { quest: quest.name },
          interactionTarget.mesh!.position
        );
        // Update journal UI if it's open
        this.game.journalDisplay?.updateQuests();
      }
    });
  }

  getQuestById(id: string): Quest | undefined {
    return this.quests.find((q) => q.id === id);
  }
}
