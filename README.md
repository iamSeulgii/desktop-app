# Desktop App

우측 하단에 떠 있는 도리 데스크탑 위젯입니다.

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

빌드 결과는 `dist` 폴더에 생성됩니다. `resources` 폴더가 함께 패키징되므로 사용자는 별도 의존성 없이 앱만 실행하면 됩니다.

> macOS 에서 LLM 추론을 사용하려면 `resources/llama/darwin/llama-cli` 와 `resources/models/<모델>.gguf` 가 필요합니다. 빌드 머신 아키텍처(arm64 또는 x64)에 맞는 `llama-cli` 바이너리를 배치하세요.

> 코드 사이닝/공증을 하지 않은 빌드는 처음 실행 시 Gatekeeper 경고가 뜰 수 있습니다. 이 경우 `xattr -dr com.apple.quarantine "/Applications/Desktop App.app"` 로 격리 속성을 제거하거나, 우클릭 → 열기로 실행하세요.
