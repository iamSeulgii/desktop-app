# Bundled LLM Resources

Place the llama.cpp CLI binary and GGUF model here before building.

Required for Windows portable builds:

```text
resources/llama/win32/llama-cli.exe
resources/models/dori.gguf
```

Required for macOS builds:

```text
resources/llama/darwin/llama-cli
resources/models/dori.gguf
```

Make sure the `llama-cli` binary is executable (`chmod +x resources/llama/darwin/llama-cli`) and matches the architecture you are building for (arm64 for Apple Silicon, x64 for Intel).

Optional for local Linux development:

```text
resources/llama/linux/llama-cli
```

The app calls `llama-cli` directly and streams stdout into the chat UI.
