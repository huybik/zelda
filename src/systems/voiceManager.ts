// systems/voiceManager.ts
import { Game } from "../main";
import { Character } from "../entities/character";
import { sendToGemini, generateChatPrompt } from "../ai/api";

export class VoiceManager {
  private game: Game;
  private recognition: SpeechRecognition | null = null;
  private synthesis: SpeechSynthesis;
  private micButton: HTMLButtonElement | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private isRecording: boolean = false;

  constructor(game: Game) {
    this.game = game;
    this.synthesis = window.speechSynthesis;
    this.synthesis.addEventListener("voiceschanged", () => {
      this.voices = this.synthesis.getVoices();
    });
    this.voices = this.synthesis.getVoices();
  }

  init(): void {
    this.micButton = document.getElementById("mic-button") as HTMLButtonElement;
    if (!this.micButton) {
      console.error("Microphone button not found");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser");
      this.micButton.disabled = true;
      return;
    }
    this.recognition = new SpeechRecognition();
    // Changed to false to listen for a single utterance per button hold, reducing network errors
    this.recognition!.continuous = true;
    this.recognition!.interimResults = false;

    this.recognition!.onresult = async (event) => {
        console.log("event", event)
      try {
        const transcript = event.results[event.results.length - 1][0].transcript;
        await this.handleRecognitionResult(transcript);
      } catch (error) {
        console.error("Error processing speech recognition result:", error);
      }
    };

    this.recognition!.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      this.stopRecording();
    };

    this.recognition!.onend = () => {
      if (this.isRecording) {
        this.recognition?.start(); // Restart if still holding
      } else {
        this.stopRecording();
      }
    };

    this.micButton.addEventListener("mousedown", () => this.startRecording());
    this.micButton.addEventListener("mouseup", () => this.stopRecording());
    this.micButton.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.startRecording();
    });
    this.micButton.addEventListener("touchend", (e) => {
      e.preventDefault();
      this.stopRecording();
    });
  }

  private startRecording(): void {
    if (!this.recognition || !this.micButton || this.isRecording) return;
    if (!this.game.interactionSystem || !this.game.interactionSystem.isChatOpen)
      return;
    const lang = localStorage.getItem("selectedLanguage") || "en";
    this.recognition.lang = lang;
    this.recognition.start();
    this.isRecording = true;
    this.micButton.classList.add("recording");
  }

  private stopRecording(): void {
    if (!this.recognition || !this.micButton || !this.isRecording) return;
    this.recognition.stop();
    this.isRecording = false;
    this.micButton.classList.remove("recording");
  }

  private handleRecognitionResult(transcript: string): void {
    if (!this.game.interactionSystem || !this.game.interactionSystem.isChatOpen)
      return;
    const target = this.game.interactionSystem.chatTarget;
    if (target) {
      this.processChatMessage(transcript, target);
    }
  }

  speak(text: string): void {
    const lang = localStorage.getItem("selectedLanguage") || "en";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = this.voices.find((v) => v.lang.startsWith(lang));
    if (voice) {
      utterance.voice = voice;
    }
    this.synthesis.speak(utterance);
  }

  private async processChatMessage(
    message: string,
    target: Character
  ): Promise<void> {
    if (!target || !message.trim()) return;

    const targetAtSendStart = target;

    this.game.activeCharacter?.updateIntentDisplay(message);
    this.game.logEvent(
      this.game.activeCharacter!,
      "chat",
      `${this.game.activeCharacter?.name} said "${message}" to ${targetAtSendStart.name}.`,
      targetAtSendStart,
      { message: message },
      this.game.activeCharacter?.mesh!.position
    );

    const prompt = generateChatPrompt(
      targetAtSendStart,
      this.game.activeCharacter!,
      message
    );
    try {
      const responseJson = await sendToGemini(prompt);

      let npcMessage = "Hmm....";
      if (responseJson) {
        try {
          const parsedText = JSON.parse(responseJson);
          npcMessage =
            parsedText.response?.trim() || responseJson.trim() || "Hmm....";
          console.log(
            `NPC Message to ${this.game.activeCharacter?.name}:`,
            npcMessage
          );
        } catch (parseError) {
          npcMessage = responseJson.trim() || "Hmm....";
          console.log(
            "Chat response was not JSON, treating as string:",
            responseJson
          );
        }
      }
      if (
        this.game.interactionSystem?.isChatOpen &&
        this.game.interactionSystem.chatTarget === targetAtSendStart
      ) {
        targetAtSendStart.updateIntentDisplay(npcMessage);
        this.game.logEvent(
          targetAtSendStart,
          "chat",
          `${targetAtSendStart.name} said "${npcMessage}" to ${this.game.activeCharacter?.name}.`,
          this.game.activeCharacter!,
          { message: npcMessage },
          targetAtSendStart.mesh!.position
        );
        this.game.questManager.checkAllQuestsCompletion();
        this.speak(npcMessage);
      } else {
        console.log("Chat closed or target changed before NPC response.");
      }
    } catch (error) {
      console.error("Error during chat API call:", error);
      if (
        this.game.interactionSystem?.isChatOpen &&
        this.game.interactionSystem.chatTarget === targetAtSendStart
      ) {
        targetAtSendStart.updateIntentDisplay("I... don't know what to say.");
        this.game.logEvent(
          targetAtSendStart,
          "chat_error",
          `${targetAtSendStart.name} failed to respond to ${this.game.activeCharacter?.name}.`,
          this.game.activeCharacter!,
          { error: (error as Error).message },
          targetAtSendStart.mesh!.position
        );
      }
    } finally {
      targetAtSendStart.aiController?.scheduleNextActionDecision();
      this.game.interactionSystem?.closeChatInterface();
    }
  }
}