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
      // TODO: add message to chat input
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

  
}