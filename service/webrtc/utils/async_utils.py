"""
异步工具模块
提供异步编程相关的工具函数
"""

import asyncio

def run_async(async_func, *args, **kwargs):
    """
    在同步环境中运行异步函数
    
    参数:
        async_func: 要运行的异步函数
        *args, **kwargs: 传递给异步函数的参数
        
    返回:
        异步函数的返回值
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(async_func(*args, **kwargs))
    finally:
        loop.close() 