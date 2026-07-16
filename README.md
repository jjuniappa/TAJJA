# Number Duel Online

GitHub Pages에서 실행할 수 있는 1:1 실시간 숫자 카드 게임입니다.

## 온라인 플레이 방식

1. 한 사용자가 `새 방 만들기`를 누릅니다.
2. 화면에 표시되는 6자리 방 코드를 친구에게 전달합니다.
3. 친구가 같은 사이트에서 방 코드를 입력하고 입장합니다.
4. 양쪽이 카드를 선택하면 카드가 동시에 공개됩니다.
5. 카드 선택은 **commit–reveal 방식**으로 처리됩니다. 먼저 `카드 숫자 + 임의값`의 SHA-256 해시를 보내고, 양쪽 선택이 잠긴 뒤 실제 값을 공개하므로 일반적인 UI 사용에서는 상대 카드를 보고 선택을 바꿀 수 없습니다.

## Firebase 설정

정적 GitHub Pages만으로는 두 브라우저 사이의 실시간 상태를 저장할 서버가 없으므로 Firebase Realtime Database를 사용합니다.

### 1. Firebase 프로젝트 만들기

Firebase Console에서 프로젝트를 만든 뒤 웹 앱을 등록합니다.

### 2. Realtime Database 활성화

Build → Realtime Database → 데이터베이스 만들기를 선택합니다.

### 3. 익명 로그인 활성화

Build → Authentication → Sign-in method → Anonymous를 활성화합니다.

### 4. 설정값 입력

Firebase 프로젝트 설정에서 웹 앱의 구성 객체를 복사해 `firebase-config.js`에 붙여 넣습니다.

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

### 5. 보안 규칙 적용

Realtime Database → Rules에서 `database.rules.json`의 내용을 붙여 넣고 게시합니다.

현재 규칙은 로그인한 익명 사용자만 방 데이터에 접근하도록 제한하는 기본 개발용 규칙입니다. 공개 서비스로 확장할 때는 App Check, 방별 접근 토큰, 서버 검증 또는 Cloud Functions를 추가하는 것을 권장합니다.

## GitHub Pages 배포

1. 이 폴더의 파일을 GitHub 저장소 루트에 업로드합니다.
2. Settings → Pages로 이동합니다.
3. Deploy from a branch를 선택합니다.
4. `main` 브랜치와 `/root`를 선택합니다.
5. 생성된 Pages 주소를 두 사용자가 함께 엽니다.

`file://`로 `index.html`을 직접 열면 ES Module과 Firebase 요청이 차단될 수 있으므로, GitHub Pages 또는 로컬 HTTP 서버에서 실행하세요.

로컬 테스트 예시:

```bash
python -m http.server 8000
```

그 후 브라우저에서 `http://localhost:8000`을 엽니다.

## 파일 구조

```text
number-duel-online/
├── index.html
├── style.css
├── multiplayer.js
├── firebase-config.js
├── database.rules.json
├── README.md
└── assets/
    ├── game-scene.png
    └── cards/
        ├── 1.png
        ├── ...
        ├── 9.png
        └── back.png
```

## 게임 규칙

- 각 플레이어는 1부터 9까지의 카드를 한 번씩 사용합니다.
- 높은 숫자가 이깁니다.
- 패자는 두 숫자의 차이만큼 에너지를 잃습니다.
- 단, 1은 9를 이깁니다.
- 에너지는 20으로 시작합니다.
- 한 명의 에너지가 0이 되거나 모든 카드를 사용하면 종료됩니다.

## 참고

현재 버전은 친구끼리 즐기는 캐주얼 게임에 적합합니다. 완전한 부정행위 방지와 경쟁 서비스 운영을 위해서는 승패 계산을 신뢰할 수 있는 서버 환경으로 옮겨야 합니다.
