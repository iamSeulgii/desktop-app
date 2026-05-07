# Bundled LLM Resources

Place the llama.cpp CLI binary and GGUF model here before building.

Required for Windows portable builds:

```text
resources/llama/win32/llama-cli.exe
resources/models/dori.gguf
```

Optional for local macOS/Linux development:

```text
resources/llama/darwin/llama-cli
resources/llama/linux/llama-cli
```

The app calls `llama-cli` directly and streams stdout into the chat UI.
