import { Game } from "../main";

interface Language {
  code: string;
  name: string;
}

export class LandingPage {
  private game: Game;
  private languageListHideTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(game: Game) {
    this.game = game;
  }

  setup(
    languages: Language[],
    savedName: string | null,
    savedLang: string | null
  ): void {
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

    let selectedLanguageCode = savedLang || "en";

    const showLanguageList = () => {
      if (this.languageListHideTimeout) {
        clearTimeout(this.languageListHideTimeout);
        this.languageListHideTimeout = null;
      }
      langListContainer.classList.remove("hidden");
    };

    const hideLanguageList = (immediate = false) => {
      if (this.languageListHideTimeout) {
        clearTimeout(this.languageListHideTimeout);
        this.languageListHideTimeout = null;
      }
      if (immediate) {
        langListContainer.classList.add("hidden");
      } else {
        this.languageListHideTimeout = setTimeout(() => {
          langListContainer.classList.add("hidden");
          this.languageListHideTimeout = null;
        }, 150);
      }
    };

    const populateLanguageList = (filter: string = "") => {
      langList.innerHTML = "";
      const filterLower = filter.toLowerCase();
      const filteredLanguages = languages.filter(
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
    const initialLang = languages.find((l) => l.code === selectedLanguageCode);
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
      this.game.setPauseState(false);

      const banner = document.getElementById("welcome-banner");
      if (banner) {
        const welcomeText = this.game.mobileControls?.isActive()
          ? `Welcome, ${playerName}! Use joysticks to move, drag screen to look, buttons to act.`
          : `Welcome, ${playerName}! [WASD] Move, Mouse Look, [I] Inv, [J] Journal, [E] Interact, [F] Attack, [C] Switch, [Esc] Unlock/Close`;
        banner.textContent = welcomeText;
        banner.classList.remove("hidden");
        setTimeout(() => banner.classList.add("hidden"), 5000);
      }

      this.game.audioElement
        ?.play()
        .catch((e) => console.warn("Background music play failed:", e));
    };

    loadingText.textContent = "Ready to start!";
  }
}
