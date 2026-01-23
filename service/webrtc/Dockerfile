FROM python:3.12-slim

# 安装系统依赖，包括git和ffmpeg
RUN apt-get update && \
    apt-get install -y build-essential pkg-config clang git ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制requirements.txt
COPY requirements.txt .

# 安装依赖
RUN pip install --no-cache-dir openai fastapi python-dotenv elevenlabs requests aiohttp mem0ai litellm humaware-vad && \
    pip install --no-cache-dir git+https://github.com/ai-poet/fastrtc.git@main#egg=fastrtc[vad,stt,tts]

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 8001

# 启动命令
CMD ["python", "server.py"] 