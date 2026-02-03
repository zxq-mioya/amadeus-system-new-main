"""
AI模块
包含与AI模型交互的各种功能
"""

# 从子模块导入公共API
from .llm import ai_stream, DEFAULT_AI_MODEL as AI_MODEL
from .emotion import predict_emotion
from .plan import ActionPlanner

__all__ = ['ai_stream', 'AI_MODEL', 'predict_emotion', 'ActionPlanner'] 