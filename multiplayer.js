import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  runTransaction,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const MAX_ENERGY = 20;
const CARD_VALUES = Array.from({ length: 9 }, (_, i) => i + 1);

const elements = {
  lobbyDialog: document.getElementById("lobbyDialog"),
  nicknameInput: document.getElementById("nicknameInput"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomButton: document.getElementById("createRoomButton"),
  joinRoomButton: document.getElementById("joinRoomButton"),
  lobbyStatus: document.getElementById("lobbyStatus"),
  roomCodeLabel: document.getElementById("roomCodeLabel"),
  copyRoomButton: document.getElementById("copyRoomButton"),
  leaveButton: document.getElementById("leaveButton"),
  restartButton: document.getElementById("restartButton"),
  opponentName: document.getElementById("opponentName"),
  playerNameLabel: document.getElementById("playerNameLabel"),
  playerHand: document.getElementById("playerHand"),
  opponentPlayedCard: document.getElementById("opponentPlayedCard"),
  playerPlayedCard: document.getElementById("playerPlayedCard"),
  opponentEnergyBar: document.getElementById("opponentEnergyBar"),
  playerEnergyBar: document.getElementById("playerEnergyBar"),
  opponentEnergyText: document.getElementById("opponentEnergyText"),
  playerEnergyText: document.getElementById("playerEnergyText"),
  roundMessage: document.getElementById("roundMessage"),
  toast: document.getElementById("toast")
};

let app;
let auth;
let db;
let uid = null;
let roomCode = null;
let playerSlot = null;
let unsubscribeRoom = null;
let latestRoom = null;
let localReveal = null;
let resolvingRound = false;

function assertFirebaseConfigured() {
  const raw = JSON.stringify(firebaseConfig);
  if (raw.includes("PASTE_YOUR")) {
    throw new Error("firebase-config.js에 Firebase 프로젝트 설정을 입력하세요.");
  }
}

async function boot() {
  renderHand([]);
  elements.lobbyDialog.showModal();

  try {
    assertFirebaseConfigured();
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);

    onAuthStateChanged(auth, (user) => {
      if (user) uid = user.uid;
    });

    const credential = await signInAnonymously(auth);
    uid = credential.user.uid;
    setLobbyStatus("온라인 연결 완료");
  } catch (error) {
    console.error(error);
    setLobbyStatus(error.message, true);
  }
}

function sanitizeNickname(value) {
  const nickname = value.trim().replace(/[<>]/g, "").slice(0, 12);
  return nickname || "PLAYER";
}

function normalizeRoomCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  crypto.getRandomValues(new Uint32Array(6)).forEach((number) => {
    result += alphabet[number % alphabet.length];
  });
  return result;
}

function freshPlayer(name, id) {
  return {
    uid: id,
    name,
    energy: MAX_ENERGY,
    remaining: CARD_VALUES,
    connected: true,
    joinedAt: Date.now(),
    rematch: false
  };
}

async function createRoom() {
  if (!uid || !db) return setLobbyStatus("Firebase 연결을 확인하세요.", true);
  lockLobbyButtons(true);

  try {
    const nickname = sanitizeNickname(elements.nicknameInput.value);
    let code;
    let roomReference;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      code = randomRoomCode();
      roomReference = ref(db, `rooms/${code}`);
      const snapshot = await get(roomReference);
      if (!snapshot.exists()) break;
      code = null;
    }

    if (!code) throw new Error("방 코드를 만들지 못했습니다. 다시 시도하세요.");

    const room = {
      status: "waiting",
      hostUid: uid,
      round: 1,
      createdAt: serverTimestamp(),
      players: {
        p1: freshPlayer(nickname, uid)
      },
      roundState: {
        commits: {},
        reveals: {},
        resolved: false
      }
    };

    await set(roomReference, room);
    await enterRoom(code, "p1");
  } catch (error) {
    console.error(error);
    setLobbyStatus(error.message || "방 생성에 실패했습니다.", true);
  } finally {
    lockLobbyButtons(false);
  }
}

async function joinRoom() {
  if (!uid || !db) return setLobbyStatus("Firebase 연결을 확인하세요.", true);

  const code = normalizeRoomCode(elements.roomCodeInput.value);
  if (code.length !== 6) return setLobbyStatus("6자리 방 코드를 입력하세요.", true);

  lockLobbyButtons(true);

  try {
    const roomReference = ref(db, `rooms/${code}`);
    const result = await runTransaction(roomReference, (room) => {
      if (!room) return;
      if (room.players?.p2 && room.players.p2.uid !== uid) return;
      if (room.status !== "waiting" && room.players?.p2?.uid !== uid) return;

      room.players = room.players || {};
      room.players.p2 = freshPlayer(sanitizeNickname(elements.nicknameInput.value), uid);
      room.status = "playing";
      room.startedAt = Date.now();
      return room;
    });

    if (!result.committed) {
      throw new Error("존재하지 않거나 이미 가득 찬 방입니다.");
    }

    await enterRoom(code, "p2");
  } catch (error) {
    console.error(error);
    setLobbyStatus(error.message || "방 입장에 실패했습니다.", true);
  } finally {
    lockLobbyButtons(false);
  }
}

async function enterRoom(code, slot) {
  roomCode = code;
  playerSlot = slot;
  localReveal = null;
  elements.roomCodeLabel.textContent = code;
  elements.lobbyDialog.close();

  const playerConnectionRef = ref(db, `rooms/${code}/players/${slot}/connected`);
  await set(playerConnectionRef, true);
  onDisconnect(playerConnectionRef).set(false);

  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = onValue(ref(db, `rooms/${code}`), async (snapshot) => {
    if (!snapshot.exists()) {
      showToast("방이 종료되었습니다.");
      await leaveRoom(false);
      return;
    }

    latestRoom = snapshot.val();
    renderRoom(latestRoom);
    await progressProtocol(latestRoom);
  });
}

function otherSlot() {
  return playerSlot === "p1" ? "p2" : "p1";
}

function renderRoom(room) {
  const me = room.players?.[playerSlot];
  const opponent = room.players?.[otherSlot()];

  if (!me) return;

  elements.playerNameLabel.textContent = me.name || "PLAYER";
  elements.opponentName.textContent = opponent?.name || "WAITING...";
  elements.playerEnergyText.textContent = String(me.energy ?? MAX_ENERGY);
  elements.opponentEnergyText.textContent = String(opponent?.energy ?? MAX_ENERGY);
  elements.playerEnergyBar.style.width = `${((me.energy ?? MAX_ENERGY) / MAX_ENERGY) * 100}%`;
  elements.opponentEnergyBar.style.width = `${((opponent?.energy ?? MAX_ENERGY) / MAX_ENERGY) * 100}%`;

  const myRemaining = Array.isArray(me.remaining) ? me.remaining : [];
  const canChoose =
    room.status === "playing" &&
    Boolean(opponent) &&
    !room.roundState?.commits?.[playerSlot] &&
    !room.roundState?.resolved;

  renderHand(myRemaining, canChoose);

  const myReveal = room.roundState?.reveals?.[playerSlot];
  const opponentReveal = room.roundState?.reveals?.[otherSlot()];
  const bothRevealed = myReveal?.value && opponentReveal?.value;

  if (bothRevealed || room.roundState?.resolved) {
    setCardImage(elements.playerPlayedCard, myReveal?.value ?? room.lastRound?.cards?.[playerSlot]);
    setCardImage(elements.opponentPlayedCard, opponentReveal?.value ?? room.lastRound?.cards?.[otherSlot()]);
  } else {
    setCardImage(elements.playerPlayedCard, null);
    setCardImage(elements.opponentPlayedCard, null);
  }

  if (room.status === "waiting") {
    elements.roundMessage.textContent = "상대 입장을 기다리는 중";
  } else if (room.status === "finished") {
    elements.roundMessage.textContent = finalMessage(room);
    elements.restartButton.classList.add("visible");
  } else if (room.roundState?.resolved) {
    elements.roundMessage.textContent = room.lastRound?.message || "다음 라운드 준비 중";
  } else if (room.roundState?.commits?.[playerSlot] && !room.roundState?.commits?.[otherSlot()]) {
    elements.roundMessage.textContent = "선택 완료 · 상대를 기다리는 중";
  } else if (
    room.roundState?.commits?.[playerSlot] &&
    room.roundState?.commits?.[otherSlot()] &&
    !bothRevealed
  ) {
    elements.roundMessage.textContent = "카드 공개 중";
  } else {
    elements.roundMessage.textContent = `ROUND ${room.round || 1} · 카드를 선택하세요`;
  }

  const bothWantRematch =
    room.players?.p1?.rematch === true &&
    room.players?.p2?.rematch === true;

  if (bothWantRematch && room.hostUid === uid) {
    startRematch();
  }
}

function renderHand(remaining, enabled = false) {
  elements.playerHand.innerHTML = "";

  CARD_VALUES.forEach((value) => {
    const button = document.createElement("button");
    button.className = "hand-card";
    button.type = "button";
    button.dataset.value = String(value);
    button.disabled = !enabled || !remaining.includes(value);

    const image = document.createElement("img");
    image.src = `assets/cards/${value}.png`;
    image.alt = `${value} 카드`;
    button.appendChild(image);

    button.addEventListener("click", () => chooseCard(value));
    elements.playerHand.appendChild(button);
  });
}

async function chooseCard(value) {
  if (!latestRoom || latestRoom.status !== "playing") return;

  const me = latestRoom.players?.[playerSlot];
  const remaining = Array.isArray(me?.remaining) ? me.remaining : [];
  if (!remaining.includes(value)) return;
  if (latestRoom.roundState?.commits?.[playerSlot]) return;

  disableHandTemporarily();

  try {
    const nonce = createNonce();
    const hash = await sha256(`${value}:${nonce}`);
    localReveal = { value, nonce, round: latestRoom.round };

    const commitPath = `rooms/${roomCode}/roundState/commits/${playerSlot}`;
    await set(ref(db, commitPath), {
      hash,
      submittedAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    localReveal = null;
    showToast("카드 선택 전송에 실패했습니다.");
  }
}

async function progressProtocol(room) {
  if (!room || room.status !== "playing") return;

  const commits = room.roundState?.commits || {};
  const reveals = room.roundState?.reveals || {};
  const bothCommitted = Boolean(commits.p1 && commits.p2);

  if (
    bothCommitted &&
    localReveal &&
    localReveal.round === room.round &&
    !reveals[playerSlot]
  ) {
    await set(
      ref(db, `rooms/${roomCode}/roundState/reveals/${playerSlot}`),
      localReveal
    );
  }

  const refreshedReveals = room.roundState?.reveals || {};
  const bothRevealed = Boolean(refreshedReveals.p1 && refreshedReveals.p2);

  if (
    bothRevealed &&
    !room.roundState?.resolved &&
    room.hostUid === uid &&
    !resolvingRound
  ) {
    await resolveRoundTransaction();
  }

  if (
    room.roundState?.resolved &&
    room.status === "playing" &&
    room.hostUid === uid
  ) {
    window.clearTimeout(progressProtocol.nextRoundTimer);
    progressProtocol.nextRoundTimer = window.setTimeout(() => {
      advanceRound();
    }, 1800);
  }
}

async function resolveRoundTransaction() {
  resolvingRound = true;

  try {
    const roomReference = ref(db, `rooms/${roomCode}`);
    await runTransaction(roomReference, (room) => {
      if (!room || room.status !== "playing" || room.roundState?.resolved) return room;

      const p1Reveal = room.roundState?.reveals?.p1;
      const p2Reveal = room.roundState?.reveals?.p2;
      const p1Commit = room.roundState?.commits?.p1;
      const p2Commit = room.roundState?.commits?.p2;

      if (!p1Reveal || !p2Reveal || !p1Commit || !p2Commit) return room;

      // The browser verified hashes before this transaction is requested.
      const result = calculateRound(p1Reveal.value, p2Reveal.value);

      room.players.p1.energy = Math.max(0, room.players.p1.energy - result.p1Damage);
      room.players.p2.energy = Math.max(0, room.players.p2.energy - result.p2Damage);
      room.players.p1.remaining = room.players.p1.remaining.filter((v) => v !== p1Reveal.value);
      room.players.p2.remaining = room.players.p2.remaining.filter((v) => v !== p2Reveal.value);

      room.lastRound = {
        number: room.round,
        cards: { p1: p1Reveal.value, p2: p2Reveal.value },
        message: result.message,
        damage: { p1: result.p1Damage, p2: result.p2Damage },
        resolvedAt: Date.now()
      };
      room.roundState.resolved = true;

      const noCards =
        room.players.p1.remaining.length === 0 ||
        room.players.p2.remaining.length === 0;
      const noEnergy =
        room.players.p1.energy <= 0 ||
        room.players.p2.energy <= 0;

      if (noCards || noEnergy) {
        room.status = "finished";
        room.finishedAt = Date.now();
      }

      return room;
    });
  } finally {
    resolvingRound = false;
  }
}

async function verifyReveal(reveal, commit) {
  if (!reveal || !commit?.hash) return false;
  return (await sha256(`${reveal.value}:${reveal.nonce}`)) === commit.hash;
}

async function advanceRound() {
  if (!roomCode || !latestRoom || latestRoom.status !== "playing") return;

  const p1Valid = await verifyReveal(
    latestRoom.roundState?.reveals?.p1,
    latestRoom.roundState?.commits?.p1
  );
  const p2Valid = await verifyReveal(
    latestRoom.roundState?.reveals?.p2,
    latestRoom.roundState?.commits?.p2
  );

  if (!p1Valid || !p2Valid) {
    showToast("카드 검증에 실패했습니다.");
    return;
  }

  await runTransaction(ref(db, `rooms/${roomCode}`), (room) => {
    if (!room || room.status !== "playing" || !room.roundState?.resolved) return room;

    room.round = (room.round || 1) + 1;
    room.roundState = {
      commits: {},
      reveals: {},
      resolved: false
    };
    return room;
  });

  localReveal = null;
}

function calculateRound(p1, p2) {
  if (p1 === p2) {
    return { p1Damage: 0, p2Damage: 0, message: `무승부 · ${p1} : ${p2}` };
  }

  const p1Wins =
    (p1 === 1 && p2 === 9) ||
    (!(p1 === 9 && p2 === 1) && p1 > p2);
  const damage = Math.abs(p1 - p2);

  return p1Wins
    ? { p1Damage: 0, p2Damage: damage, message: `P1 승리 · P2 -${damage}` }
    : { p1Damage: damage, p2Damage: 0, message: `P2 승리 · P1 -${damage}` };
}

function finalMessage(room) {
  const me = room.players?.[playerSlot];
  const opponent = room.players?.[otherSlot()];
  if (!me || !opponent) return "게임 종료";
  if (me.energy > opponent.energy) return `최종 승리 · ${me.energy} : ${opponent.energy}`;
  if (me.energy < opponent.energy) return `최종 패배 · ${me.energy} : ${opponent.energy}`;
  return `최종 무승부 · ${me.energy} : ${opponent.energy}`;
}

async function requestRematch() {
  if (!roomCode || !playerSlot) return;
  await set(ref(db, `rooms/${roomCode}/players/${playerSlot}/rematch`), true);
  elements.roundMessage.textContent = "상대의 재대결 수락을 기다리는 중";
}

async function startRematch() {
  await runTransaction(ref(db, `rooms/${roomCode}`), (room) => {
    if (!room || room.status !== "finished") return room;
    if (!room.players?.p1?.rematch || !room.players?.p2?.rematch) return room;

    room.status = "playing";
    room.round = 1;
    room.players.p1.energy = MAX_ENERGY;
    room.players.p2.energy = MAX_ENERGY;
    room.players.p1.remaining = CARD_VALUES;
    room.players.p2.remaining = CARD_VALUES;
    room.players.p1.rematch = false;
    room.players.p2.rematch = false;
    room.roundState = { commits: {}, reveals: {}, resolved: false };
    room.lastRound = null;
    room.startedAt = Date.now();
    return room;
  });

  localReveal = null;
  elements.restartButton.classList.remove("visible");
}

async function leaveRoom(removeOwnSlot = true) {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  if (removeOwnSlot && db && roomCode && playerSlot) {
    const updates = {};
    updates[`rooms/${roomCode}/players/${playerSlot}/connected`] = false;
    await update(ref(db), updates).catch(console.error);
  }

  roomCode = null;
  playerSlot = null;
  latestRoom = null;
  localReveal = null;
  elements.roomCodeLabel.textContent = "------";
  elements.restartButton.classList.remove("visible");
  setCardImage(elements.playerPlayedCard, null);
  setCardImage(elements.opponentPlayedCard, null);
  renderHand([]);
  elements.lobbyDialog.showModal();
}

function setCardImage(element, value) {
  const image = element.querySelector("img");
  image.src = value == null ? "assets/cards/back.png" : `assets/cards/${value}.png`;
  image.alt = value == null ? "카드 뒷면" : `${value} 카드`;
}

function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function disableHandTemporarily() {
  elements.playerHand.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
}

function setLobbyStatus(message, isError = false) {
  elements.lobbyStatus.textContent = message;
  elements.lobbyStatus.classList.toggle("error", isError);
}

function lockLobbyButtons(locked) {
  elements.createRoomButton.disabled = locked;
  elements.joinRoomButton.disabled = locked;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2400);
}

elements.createRoomButton.addEventListener("click", createRoom);
elements.joinRoomButton.addEventListener("click", joinRoom);
elements.leaveButton.addEventListener("click", () => leaveRoom(true));
elements.restartButton.addEventListener("click", requestRematch);

elements.roomCodeInput.addEventListener("input", (event) => {
  event.target.value = normalizeRoomCode(event.target.value);
});

elements.copyRoomButton.addEventListener("click", async () => {
  if (!roomCode) return;
  await navigator.clipboard.writeText(roomCode);
  showToast("방 코드를 복사했습니다.");
});

window.addEventListener("beforeunload", () => {
  if (db && roomCode && playerSlot) {
    set(ref(db, `rooms/${roomCode}/players/${playerSlot}/connected`), false);
  }
});

boot();
