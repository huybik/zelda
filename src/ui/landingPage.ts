/* File: /src/ui/landingPage.ts */
import { Game } from "../main";

interface Language {
  code: string;
  name: string;
}

export class LandingPage {
  private game: Game;
  private languageListHideTimeout: ReturnType<typeof setTimeout> | null = null;
  languages: Language[] = [
    { code: "en", name: "English" },
    { code: "es", name: "Español (Spanish)" },
    { code: "fr", name: "Français (French)" },
    { code: "de", name: "Deutsch (German)" },
    { code: "zh", name: "中文 (Chinese)" },
    { code: "ja", name: "日本語 (Japanese)" },
    { code: "ko", name: "한국어 (Korean)" },
    { code: "ru", name: "Русский (Russian)" },
    { code: "pt", name: "Português (Portuguese)" },
    { code: "it", name: "Italiano (Italian)" },
    { code: "ar", name: "العربية (Arabic)" },
    { code: "hi", name: "हिन्दी (Hindi)" },
    { code: "bn", name: "বাংলা (Bengali)" },
    { code: "pa", name: "ਪੰਜਾਬੀ (Punjabi)" },
    { code: "jv", name: "Basa Jawa (Javanese)" },
    { code: "ms", name: "Bahasa Melayu (Malay)" },
    { code: "tr", name: "Türkçe (Turkish)" },
    { code: "vi", name: "Tiếng Việt (Vietnamese)" },
    { code: "te", name: "తెలుగు (Telugu)" },
    { code: "mr", name: "मराठी (Marathi)" },
    { code: "ta", name: "தமிழ் (Tamil)" },
    { code: "ur", name: "اردو (Urdu)" },
    { code: "fa", name: "فارسی (Persian)" },
    { code: "nl", name: "Nederlands (Dutch)" },
    { code: "pl", name: "Polski (Polish)" },
    { code: "uk", name: "Українська (Ukrainian)" },
    { code: "ro", name: "Română (Romanian)" },
    { code: "sv", name: "Svenska (Swedish)" },
    { code: "el", name: "Ελληνικά (Greek)" },
    { code: "hu", name: "Magyar (Hungarian)" },
    { code: "cs", name: "Čeština (Czech)" },
    { code: "fi", name: "Suomi (Finnish)" },
    { code: "he", name: "עברית (Hebrew)" },
    { code: "th", name: "ไทย (Thai)" },
    { code: "id", name: "Bahasa Indonesia (Indonesian)" },
  ].sort((a, b) => a.name.localeCompare(b.name));

  constructor(game: Game) {
    this.game = game;
  }

  setup(savedName: string | null, savedLang: string | null): void {
    const landingPage = document.getElementById("landing-page");
    const nameInput = document.getElementById(
      "player-name"
    ) as HTMLInputElement;
    const langSearchInput = document.getElementById(
      "language-search"
    ) as HTMLInputElement;
    const langListContainer = document.getElementById(
      "language-list-container"
    );
    const langList = document.getElementById(
      "language-list"
    ) as HTMLUListElement;
    const startButton = document.getElementById("start-game-button");
    const gameContainer = document.getElementById("game-container");
    const uiContainer = document.getElementById("ui-container");
    const loadingText = landingPage?.querySelector(".loading-text");

    if (
      !landingPage ||
      !nameInput ||
      !langSearchInput ||
      !langListContainer ||
      !langList ||
      !startButton ||
      !gameContainer ||
      !uiContainer ||
      !loadingText
    ) {
      console.error("Landing page elements not found!");
      this.game.isGameStarted = true;
      gameContainer?.classList.remove("hidden");
      uiContainer?.classList.remove("hidden");
      return;
    }

    // Pause the game while landing page is visible
    this.game.setPauseState(true);

    let selectedLanguageCode = savedLang || "en";

    const showLanguageList = () => {
      if (this.languageListHideTimeout) {
        clearTimeout(this.languageListHideTimeout);
        this.languageListHideTimeout = null;
      }
      langListContainer?.classList.remove("hidden");
    };

    const hideLanguageList = (immediate = false) => {
      if (this.languageListHideTimeout) {
        clearTimeout(this.languageListHideTimeout);
        this.languageListHideTimeout = null;
      }
      if (immediate) {
        langListContainer?.classList.add("hidden");
      } else {
        this.languageListHideTimeout = setTimeout(() => {
          langListContainer?.classList.add("hidden");
          this.languageListHideTimeout = null;
        }, 150);
      }
    };

    const populateLanguageList = (filter: string = "") => {
      langList.innerHTML = "";
      const filterLower = filter.toLowerCase();
      const filteredLanguages = this.languages.filter(
        (lang) =>
          lang.name.toLowerCase().includes(filterLower) ||
          lang.code.toLowerCase().includes(filterLower)
      );

      filteredLanguages.forEach((lang) => {
        const li = document.createElement("li");
        li.textContent = lang.name;
        li.dataset.langCode = lang.code;
        if (lang.code === selectedLanguageCode) {
          li.classList.add("selected");
        }
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          selectedLanguageCode = lang.code;
          langSearchInput.value = lang.name;
          localStorage.setItem("selectedLanguageName", lang.name);
          populateLanguageList();
          hideLanguageList(true);
        });
        langList.appendChild(li);
      });
    };

    populateLanguageList();
    hideLanguageList(true);

    if (savedName) nameInput.value = savedName;
    const initialLang = this.languages.find(
      (l) => l.code === selectedLanguageCode
    );
    if (initialLang) langSearchInput.value = initialLang.name;

    langSearchInput.addEventListener("input", () => {
      populateLanguageList(langSearchInput.value);
      showLanguageList();
    });
    langSearchInput.addEventListener("focus", () => {
      showLanguageList();
      langSearchInput.select();
    });
    langSearchInput.addEventListener("blur", () => hideLanguageList());

    startButton.onclick = () => {
      const playerName = nameInput.value.trim() || "Player";
      localStorage.setItem("playerName", playerName);
      localStorage.setItem("selectedLanguage", selectedLanguageCode);
      this.game.language = selectedLanguageCode;

      if (this.game.activeCharacter) {
        this.game.activeCharacter.name = playerName;
        this.game.activeCharacter.updateNameDisplay(playerName);
      }

      landingPage.classList.add("hidden");
      gameContainer.classList.remove("hidden");
      uiContainer.classList.remove("hidden");

      this.game.isGameStarted = true;

      // Unpause is handled by showQuestBanner -> OK button click
      // this.game.setPauseState(false); // Remove this line

      // Show the first quest banner instead of welcome banner
      const firstQuest = this.game.questManager.quests?.[0];
      if (firstQuest) {
        this.game.showQuestBanner(firstQuest);
      } else {
        // If no quests, just unpause
        this.game.setPauseState(false);
      }

      this.game.audioElement
        ?.play()
        .catch((e) => console.warn("Background music play failed:", e));
    };

    loadingText.textContent = "Ready to start!";
  }
}