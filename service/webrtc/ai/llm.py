"""
AI流式响应模块
提供与AI模型交互的流式响应功能
"""

import logging
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 从环境变量获取默认模型名称
DEFAULT_AI_MODEL = os.getenv("AI_MODEL", "claude-3-5-sonnet-20241022")
# 设置默认的上下文最大消息数
DEFAULT_MAX_CONTEXT_LENGTH = 20

def ai_stream(client, messages, model=None, max_tokens=200, max_context_length=None):
    """
    从LLM获取流式文本响应
    
    参数:
        client: OpenAI客户端实例
        messages: 消息历史列表
        model: 使用的模型名称，如不指定则使用环境变量中的设置
        max_tokens: 最大生成的token数，默认为200
        max_context_length: 上下文最大消息数，默认为20条
        
    返回:
        generator: 生成文本片段的生成器和完整响应
    """

    full_response = ""  # 初始化为空字符串
    
    # 如果未指定model参数，则使用环境变量中的设置
    if model is None:
        model = DEFAULT_AI_MODEL
    
    # 如果未指定max_context_length参数，则使用默认值
    if max_context_length is None:
        max_context_length = DEFAULT_MAX_CONTEXT_LENGTH
    
    # 裁剪上下文消息
    trimmed_messages = trim_messages(messages, max_context_length)
    logging.info(f"消息数量: 原始={len(messages)}, 裁剪后={len(trimmed_messages)}")
    # 创建聊天完成请求
    response = client.chat.completions.create(
        model=model,  # 使用指定的模型
        messages=trimmed_messages,  # 裁剪后的消息历史
        max_tokens=max_tokens,  # 最大生成的token数
        stream=True,  # 启用流式响应
    )
    
    # 处理流式响应的每个块
    for chunk in response:
        if chunk.choices[0].finish_reason == "stop":  # 如果生成结束
            break
        if chunk.choices[0].delta.content:  # 如果有内容
            content = chunk.choices[0].delta.content
            full_response += content  # 添加到完整响应
            yield content, full_response  # 产生这个文本片段和当前的完整响应 

def trim_messages(messages, max_length):
    """
    裁剪消息历史，保留最重要的消息
    
    参数:
        messages: 原始消息历史列表
        max_length: 最大保留的消息数量
        
    返回:
        list: 裁剪后的消息列表
    """
    # 如果消息数量小于等于最大长度，则直接返回原始消息
    if len(messages) <= max_length:
        return messages
    
    # 始终保留系统消息（通常是第一条）
    system_messages = [msg for msg in messages if msg["role"] == "system"]
    
    # 获取非系统消息
    non_system_messages = [msg for msg in messages if msg["role"] != "system"]
    
    # 计算需要保留的非系统消息数量
    keep_count = max_length - len(system_messages)
    
    # 如果需要保留的非系统消息数量小于等于0，则只保留系统消息
    if keep_count <= 0:
        return system_messages
    
    # 保留最近的非系统消息
    recent_messages = non_system_messages[-keep_count:] if keep_count > 0 else []
    
    # 合并系统消息和最近的非系统消息
    return system_messages + recent_messages 