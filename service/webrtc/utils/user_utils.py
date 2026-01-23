"""
用户工具函数
包含用户相关的工具函数
"""

import hashlib

def generate_unique_user_id(username: str) -> str:
    """
    根据用户名生成唯一的用户ID
    该ID对于同一用户名将始终保持一致，不随时间变化
    
    参数:
        username (str): 用户名
        
    返回:
        str: 生成的唯一用户ID（MD5哈希的前16位）
    """
    # 使用固定的盐值确保同一用户名总是产生相同的ID
    salt = "amadeus_system_fixed_salt_09876"
    # 使用用户名和盐值生成MD5哈希
    md5_hash = hashlib.md5(f"{username}_{salt}".encode('utf-8')).hexdigest()
    # 返回哈希的前16位作为userId
    return md5_hash[:16] 