const MAX_ENERGY = 20;

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

function resetGame() {
  playerEnergy = MAX_ENERGY;
  aiEnergy = MAX_ENERGY;
  playerCards = Array.from({ length: 9 }, (_, i) => i + 1);
  aiCards = Array.from({ length: 9 }, (_, i) => i + 1);
  gameOver = false;

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

  for (let value = 1; value <= 9; value += 1) {
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

  const aiIndex = Math.floor(Math.random() * aiCards.length);
  const aiValue = aiCards[aiIndex];

  playerCards = playerCards.filter((card) => card !== playerValue);
  aiCards.splice(aiIndex, 1);

  revealCard(playerPlayedCard, playerValue);
  revealCard(aiPlayedCard, aiValue);

  const result = resolveRound(playerValue, aiValue);
  roundMessage.textContent = result.message;

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
    };
  }

  const playerWins =
    (player === 1 && ai === 9) ||
    (!(player === 9 && ai === 1) && player > ai);

  const damage = Math.abs(player - ai);

  if (playerWins) {
    return {
      playerDamage: 0,
      aiDamage: damage,
      message: `승리 · AI -${damage}`,
    };
  }

  return {
    playerDamage: damage,
    aiDamage: 0,
    message: `패배 · PLAYER -${damage}`,
  };
}

function revealCard(element, value) {
  setCardImage(element, value, `${value} 카드`);
  clearSpecialClasses(element);

  if (value === 1) element.classList.add("special-one");
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
  element.classList.remove("special-one", "special-nine");
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
  if (playerEnergy > aiEnergy) result = "최종 승리";
  else if (playerEnergy < aiEnergy) result = "최종 패배";
  else result = "최종 무승부";

  roundMessage.textContent = `${result} · ${playerEnergy} : ${aiEnergy}`;
  restartButton.classList.add("visible");
  renderHand();
}

restartButton.addEventListener("click", resetGame);
resetGame();
