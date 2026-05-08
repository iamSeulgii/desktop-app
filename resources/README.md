# Bundled Resources

이 폴더는 더 이상 LLM 바이너리/모델을 번들링할 필요가 없어요 — 채팅은 Gemini API 를 호출하는 방식으로 바뀌었습니다.

향후 기본 자산(아이콘, 효과음 등)을 패키지에 포함하고 싶을 때 이 폴더에 두면 빌드된 앱의 `resources/` 경로(`process.resourcesPath`)에 함께 복사됩니다.
