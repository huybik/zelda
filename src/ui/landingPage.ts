/* File: /src/ui/landingPage.ts */
import { Game } from "../main";
import { Profession, ProfessionStartingWeapon } from "../core/items"; // Import Profession enum and starting weapon map
import { getItemDefinition } from "../core/items"; // Import item definitions

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

  setup(
    savedName: string | null,
    savedLang: string | null,
    savedProfession: Profession | null
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
    const professionSelector = document.getElementById(
      "profession-selector"
    ) as HTMLDivElement;
    const startingWeaponDisplay = document.getElementById(
      "starting-weapon"
    ) as HTMLSpanElement;
    const startingWeaponIcon = document.getElementById(
      "starting-weapon-icon"
    ) as HTMLImageElement; // Get the image element

    if (
      !landingPage ||
      !nameInput ||
      !langSearchInput ||
      !langListContainer ||
      !langList ||
      !startButton ||
      !gameContainer ||
      !uiContainer ||
      !loadingText ||
      !professionSelector ||
      !startingWeaponDisplay ||
      !startingWeaponIcon // Check for icon element
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
    let selectedProfession = savedProfession || Profession.Hunter; // Default to Hunter

    // --- Profession Selection ---
    const updateStartingWeaponDisplay = () => {
      const weaponId = ProfessionStartingWeapon[selectedProfession];
      if (weaponId) {
        const weaponDef = getItemDefinition(weaponId);
        startingWeaponDisplay.textContent = weaponDef
          ? weaponDef.name
          : "Unknown";
        // Update icon
        startingWeaponIcon.src = weaponDef
          ? `assets/items/icons/${weaponDef.icon}`
          : "";
        startingWeaponIcon.alt = weaponDef ? weaponDef.name : "";
        startingWeaponIcon.style.display = weaponDef ? "inline-block" : "none";
      } else {
        startingWeaponDisplay.textContent = "None";
        startingWeaponIcon.style.display = "none"; // Hide icon if no weapon
      }
    };

    // Populate profession radio buttons
    Object.values(Profession).forEach((prof) => {
      if (prof === Profession.None) return; // Don't allow selecting 'None'

      const radioId = `prof-${prof}`;
      const label = document.createElement("label");
      label.htmlFor = radioId;
      label.textContent = prof;

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.id = radioId;
      radio.name = "profession";
      radio.value = prof;
      radio.checked = prof === selectedProfession;

      radio.addEventListener("change", () => {
        if (radio.checked) {
          selectedProfession = prof as Profession;
          updateStartingWeaponDisplay();
        }
      });

      const container = document.createElement("div"); // Container for radio + label
      container.classList.add("profession-option");
      container.appendChild(radio);
      container.appendChild(label);

      professionSelector.appendChild(container);
    });

    updateStartingWeaponDisplay(); // Initial display

    // --- Language Selection ---
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

    // --- Start Button ---
    startButton.onclick = () => {
      const playerName = nameInput.value.trim() || "Player";
      localStorage.setItem("playerName", playerName);
      localStorage.setItem("selectedLanguage", selectedLanguageCode);
      localStorage.setItem("selectedProfession", selectedProfession); // Save profession
      this.game.language = selectedLanguageCode;
      this.game.playerProfession = selectedProfession; // Set profession in Game

      if (this.game.activeCharacter) {
        this.game.activeCharacter.name = playerName;
        this.game.activeCharacter.profession = selectedProfession; // Set profession on Character
        this.game.activeCharacter.updateNameDisplay(playerName);
        this.game.giveStartingWeapon(); // Give weapon after character is ready
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
        this.game.showQuestNotification(firstQuest);
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
