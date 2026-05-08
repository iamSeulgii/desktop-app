# Desktop App

우측 하단에 떠 있는 도리 데스크탑 위젯입니다. 채팅은 [Google Gemini API](https://aistudio.google.com/app/apikey) 를 호출해서 동작합니다.

## Gemini API 키 설정

1. 앱을 실행한 뒤 마스코트를 클릭해 메뉴를 열고, 우측 상단 ⚙ 버튼으로 설정 화면 진입
2. `AIza...` 형태의 API 키를 입력하고 저장
3. 키는 OS 의 사용자 데이터 폴더(`app.getPath('userData')/settings.json`) 에만 로컬 저장됩니다

## 개발 실행

```bash
npm install
```

```bash
cd ~/Desktop/myproject
npm start
```

## Windows portable exe 빌드

```bash
npm run build:win
```

## macOS 빌드

Apple Silicon / Intel 모두 지원하는 dmg + zip 을 빌드합니다.

```bash
# 현재 머신 아키텍처에 맞춰 빌드 (arm64 + x64 둘 다)
npm run build:mac

# Apple Silicon 전용
npm run build:mac:arm64

# Intel 전용
npm run build:mac:x64
```

빌드 결과는 `dist` 폴더에 생성됩니다. 앱을 받은 사용자는 자신의 Gemini API 키만 설정 화면에 입력하면 바로 사용 가능합니다.

> 코드 사이닝/공증을 하지 않은 macOS 빌드는 처음 실행 시 Gatekeeper 경고가 뜰 수 있습니다. 이 경우 `xattr -dr com.apple.quarantine "/Applications/Desktop App.app"` 로 격리 속성을 제거하거나, 우클릭 → 열기로 실행하세요.
