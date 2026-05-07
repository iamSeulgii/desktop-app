# Desktop App

우측 하단에 떠 있는 도리 데스크탑 위젯입니다.

## 개발 실행

```bash
cd ~/Desktop/myproject
npm start
```

## 내장 모델 준비

최종 exe만 배포하려면 아래 파일들이 필요합니다.

```text
resources/
  llama/
    win32/
      llama-cli.exe
    darwin/
      llama-cli
    linux/
      llama-cli
  models/
    dori.gguf
```

`config.json`에서 모델 파일명, 토큰 수, 온도, 시스템 프롬프트를 바꿀 수 있습니다.

```json
{
  "modelFile": "dori.gguf",
  "maxTokens": 512,
  "temperature": 0.7
}
```

## Windows portable exe 빌드

```bash
npm run build
```

빌드 결과는 `dist` 폴더에 생성됩니다. `resources` 폴더가 함께 패키징되므로 사용자는 Node.js/npm/Ollama 없이 exe만 실행하면 됩니다.

## 기능

- 우측 하단 고정
- 다른 창 위에 표시
- 상태별 도리 이미지
- 상태별 경과 타이머
- 내장 GGUF 모델 질의
- 스트리밍 응답
- 드래그 이동 및 우측 하단 재정렬
