const MAX_ENERGY = 15;

let playerEnergy = MAX_ENERGY;
let aiEnergy = MAX_ENERGY;
let playerCards = [];
let aiCards = [];
let gameOver = false;

const playerHand = document.getElementById("playerHand");
const aiPlayedCard = document.getElementById("aiPlayedCard");
const playerPlayedCard = document.getElementById("playerPlayedCard");
const aiEnergyBar = document.getElementById("aiEnergyBar");
const playerEnergyBar = document.getElementById("playerEnergyBar");
const aiEnergyText = document.getElementById("aiEnergyText");
const playerEnergyText = document.getElementById("playerEnergyText");
const roundMessage = document.getElementById("roundMessage");
const restartButton = document.getElementById("restartButton");
const sceneImage = document.getElementById("sceneImage");

const SCENES = {
  neutral: "assets/game-scene.png",
  aiWin: "assets/game-scene-ai-win.png",
  aiLose: "assets/game-scene-ai-lose.png",
};

let sceneResetTimer = null;

function resetGame() {
  playerEnergy = MAX_ENERGY;
  aiEnergy = MAX_ENERGY;
  playerCards = Array.from({ length: 10 }, (_, i) => i);
  aiCards = Array.from({ length: 10 }, (_, i) => i);
  gameOver = false;
  clearSceneResetTimer();
  setScene("neutral");

  setCardImage(aiPlayedCard, null, "AI 카드 뒷면");
  setCardImage(playerPlayedCard, null, "플레이어 카드 뒷면");
  clearSpecialClasses(aiPlayedCard);
  clearSpecialClasses(playerPlayedCard);
  roundMessage.textContent = "카드를 선택하세요";
  restartButton.classList.remove("visible");

  renderHand();
  updateEnergy();
}

function renderHand() {
  playerHand.innerHTML = "";

  for (let value = 0; value <= 9; value += 1) {
    const button = document.createElement("button");
    button.className = "hand-card";
    button.type = "button";
    button.dataset.value = String(value);
    const image = document.createElement("img");
    image.src = `assets/cards/${value}.png`;
    image.alt = `${value} 카드`;
    button.appendChild(image);
    button.disabled = !playerCards.includes(value) || gameOver;
    button.setAttribute("aria-label", `${value} 카드 선택`);
    button.addEventListener("click", () => playRound(value));
    playerHand.appendChild(button);
  }
}

function playRound(playerValue) {
  if (gameOver || !playerCards.includes(playerValue)) return;

  setScene("neutral");

  const aiIndex = Math.floor(Math.random() * aiCards.length);
  const aiValue = aiCards[aiIndex];

  playerCards = playerCards.filter((card) => card !== playerValue);
  aiCards.splice(aiIndex, 1);

  revealCard(playerPlayedCard, playerValue);
  revealCard(aiPlayedCard, aiValue);

  const result = resolveRound(playerValue, aiValue);
  roundMessage.textContent = result.message;
  showTemporaryScene(result.scene, 2000);

  playerEnergy = Math.max(0, playerEnergy - result.playerDamage);
  aiEnergy = Math.max(0, aiEnergy - result.aiDamage);

  updateEnergy();
  renderHand();

  if (
    playerEnergy <= 0 ||
    aiEnergy <= 0 ||
    playerCards.length === 0 ||
    aiCards.length === 0
  ) {
    endGame();
  }
}

function resolveRound(player, ai) {
  if (player === ai) {
    return {
      playerDamage: 0,
      aiDamage: 0,
      message: `무승부 · ${player} : ${ai}`,
      scene: "neutral",
    };
  }

  const playerWins =
    (player === 0 && ai === 9) ||
    (!(player === 9 && ai === 0) && player > ai);

  const damage = Math.abs(player - ai);

  if (playerWins) {
    return {
      playerDamage: 0,
      aiDamage: damage,
      message: `승리 · AI -${damage}`,
      scene: "aiLose",
    };
  }

  return {
    playerDamage: damage,
    aiDamage: 0,
    message: `패배 · PLAYER -${damage}`,
    scene: "aiWin",
  };
}

function clearSceneResetTimer() {
  if (sceneResetTimer !== null) {
    window.clearTimeout(sceneResetTimer);
    sceneResetTimer = null;
  }
}

function showTemporaryScene(sceneName, duration = 2000) {
  clearSceneResetTimer();
  setScene(sceneName);

  if (sceneName === "neutral") return;

  sceneResetTimer = window.setTimeout(() => {
    setScene("neutral");
    sceneResetTimer = null;
  }, duration);
}

function setScene(sceneName) {
  const nextSource = SCENES[sceneName] || SCENES.neutral;

  if (sceneImage.getAttribute("src") === nextSource) return;

  sceneImage.classList.add("changing");

  window.setTimeout(() => {
    sceneImage.src = nextSource;
    sceneImage.alt =
      sceneName === "aiWin"
        ? "승리해서 기뻐하는 여성 AI와 카드 테이블"
        : sceneName === "aiLose"
          ? "패배해서 화난 여성 AI와 카드 테이블"
          : "고딕 카드 경기장과 여성 AI 상대, 카드 테이블";

    sceneImage.addEventListener(
      "load",
      () => sceneImage.classList.remove("changing"),
      { once: true }
    );
  }, 120);
}

function revealCard(element, value) {
  setCardImage(element, value, `${value} 카드`);
  clearSpecialClasses(element);

  if (value === 0) element.classList.add("special-zero");
  if (value === 9) element.classList.add("special-nine");
}

function setCardImage(element, value, altText) {
  const image = element.querySelector("img");
  image.src = value === null
    ? "assets/cards/back.png"
    : `assets/cards/${value}.png`;
  image.alt = altText;
}

function clearSpecialClasses(element) {
  element.classList.remove("special-zero", "special-nine");
}

function updateEnergy() {
  aiEnergyText.textContent = String(aiEnergy);
  playerEnergyText.textContent = String(playerEnergy);
  aiEnergyBar.style.width = `${(aiEnergy / MAX_ENERGY) * 100}%`;
  playerEnergyBar.style.width = `${(playerEnergy / MAX_ENERGY) * 100}%`;
}

function endGame() {
  gameOver = true;

  let result;
  if (playerEnergy > aiEnergy) {
    result = "최종 승리";
    showTemporaryScene("aiLose", 2000);
  } else if (playerEnergy < aiEnergy) {
    result = "최종 패배";
    showTemporaryScene("aiWin", 2000);
  } else {
    result = "최종 무승부";
    clearSceneResetTimer();
    setScene("neutral");
  }

  roundMessage.textContent = `${result} · ${playerEnergy} : ${aiEnergy}`;
  restartButton.classList.add("visible");
  renderHand();
}

restartButton.addEventListener("click", resetGame);
resetGame();
