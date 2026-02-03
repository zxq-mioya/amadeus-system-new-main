"""
语音转文本模块
提供将音频转换为文本的功能
"""

import logging
import os
from fastrtc import audio_to_bytes
from dotenv import load_dotenv
from openai import OpenAI

# 加载环境变量
load_dotenv()

# 从环境变量获取默认的 Whisper API 密钥和模型
DEFAULT_WHISPER_API_KEY = os.getenv("WHISPER_API_KEY", "")
DEFAULT_WHISPER_BASE_URL = os.getenv("WHISPER_BASE_URL", "")
DEFAULT_WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-large-v3")

async def transcribe(audio, api_key=None, base_url=None, model=None):
    """
    将音频数据转换为文本
    
    参数:
        audio (tuple): 包含采样率和音频数据的元组
        api_key (str, optional): Whisper API 密钥，如不指定则使用默认值
        base_url (str, optional): Whisper API 基础 URL，如不指定则使用默认值
        model (str, optional): Whisper 模型名称，如不指定则使用默认值
        
    返回:
        str: 识别的文本，如果失败则返回空字符串
    """
    logging.info("开始转录音频")
    
    # 使用传入的 API 密钥、基础 URL 和模型，如果没有则使用默认值
    whisper_api_key = api_key if api_key else DEFAULT_WHISPER_API_KEY
    whisper_base_url = base_url if base_url else DEFAULT_WHISPER_BASE_URL
    whisper_model = model if model else DEFAULT_WHISPER_MODEL
    
    # 检查必要的 API 密钥和基础 URL
    if not whisper_api_key or not whisper_base_url:
        logging.error("缺少 Whisper API 密钥或基础 URL，无法进行转录")
        return ""
    
    # 日志记录使用的模型
    logging.info(f"使用模型 {whisper_model} 进行转录")
    
    # 尝试使用 OpenAI 客户端
    try:
        # 为每次请求创建一个新的客户端
        transcription_client = OpenAI(
            api_key=whisper_api_key,
            base_url=whisper_base_url
        )
        
        response = transcription_client.audio.transcriptions.create(
            model=whisper_model,
            file=("audio-file.mp3", audio_to_bytes(audio)),
            response_format="json"
        )
        # 打印完整响应到日志
        logging.info(f"转录API响应: {response}")
        
        # 处理响应，根据实际API返回格式获取文本
        if hasattr(response, 'text'):
            result_text = response.text
        elif isinstance(response, dict) and 'text' in response:
            result_text = response['text']
        else:
            # 如果无法直接获取text字段，尝试将整个响应转换为字符串
            result_text = str(response)
        
        # 记录转录结果
        logging.info(f"转录结果: {result_text}")
        return result_text
    
    except Exception as e:
        # 记录错误
        logging.error(f"转录失败: {str(e)}")
        return ""  # 失败时返回空字符串 