

### 前端开发环境搭建

1. **克隆项目**
   ```bash
   git clone https://github.com/ai-poet/amadeus-system-new-alpha.git
   cd amadeus-system-new-alpha
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   # 复制环境变量文件
   cp .env.development.example .env.development
   # 编辑配置文件，填入必要的环境变量
   ```

4. **启动开发服务器**
   ```bash
   npm run dev
   ```
   
   应用将在 `http://localhost:1002` 启动

### 后端服务开发

1. **进入服务目录**
   ```bash
   cd service
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **配置环境变量**
   ```bash
   # 复制环境变量文件
   cp .env.example .env
   # 编辑配置文件，填入必要的API密钥
   ```

4. **启动开发服务**
   ```bash
   pnpm dev
   ```

### WebRTC服务开发（Python）

1. **进入WebRTC服务目录**
   ```bash
   cd service/webrtc
   ```

2. **创建虚拟环境**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # 或 venv\Scripts\activate  # Windows
   ```

3. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

4. **配置环境变量**
   ```bash
   # 复制环境变量文件
   cp .env.example .env
   # 编辑配置文件，填入必要的API密钥
   ```

5. **启动WebRTC服务**
   ```bash
   python server.py
   ```
   
   服务将在 `http://localhost:8001` 启动



运行WebRTC服务容器：

```bash
docker run -d --name amadeus-webrtc \
  -p 8001:8001 \
  -e LLM_API_KEY=你的OpenAI_API密钥 \
  -e WHISPER_API_KEY=你的Whisper_API密钥 \
  -e SILICONFLOW_API_KEY=你的硅基流动API密钥 \
  -e SILICONFLOW_VOICE=你的硅基流动语音ID \
  -e LLM_BASE_URL=你的大语言模型API的基础URL \
  -e WHISPER_BASE_URL=你的Whisper API的基础URL \
  -e WHISPER_MODEL=你的Whisper模型版本 \
  -e AI_MODEL=大语言模型型号 \
  -e MEM0_API_KEY=你的MEM0记忆服务API密钥 \
  -e TIME_LIMIT=你的WebRTC流的最大时间限制(秒) \
  -e CONCURRENCY_LIMIT=你的最大并发连接数 \
  amadeus-webrtc-service
```

#### WebRTC服务环境变量说明

以下是WebRTC服务的内置AI服务的环境变量说明，可以用于搭建公共服务：

| 环境变量 | 说明 | 默认值 |
|---------|------|-------|
| `LLM_API_KEY` | OpenAI或兼容API的密钥，用于大语言模型服务 | 无 |
| `WHISPER_API_KEY` | Whisper API密钥，用于语音识别服务 | 无 |
| `SILICONFLOW_API_KEY` | 硅基流动API密钥，用于语音合成服务 | 无 |
| `SILICONFLOW_VOICE` | 硅基流动你自定义的语音ID | 无 |
| `LLM_BASE_URL` | 大语言模型API的基础URL | 无 |
| `WHISPER_BASE_URL` | Whisper API的基础URL | 无 |
| `WHISPER_MODEL` | 使用的Whisper模型版本 | 无 |
| `AI_MODEL` | 使用的大语言模型型号 | 无 |
| `MEM0_API_KEY` | MEM0记忆服务的API密钥 | 无 |
| `TIME_LIMIT` | WebRTC流的最大时间限制(秒) | 600 |
| `CONCURRENCY_LIMIT` | 最大并发连接数 | 10 |

