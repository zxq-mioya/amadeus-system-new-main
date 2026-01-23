import fetch from 'node-fetch';
import FormData from 'form-data';

export class VoiceCloneService {
  private apiBaseUrl: string = 'https://api.siliconflow.cn/v1';

  // 从URL获取音频文件并转换为base64
  private async fetchAudioAndConvertToBase64(audioUrl: string): Promise<string> {
    try {
      const response = await fetch(audioUrl);
      
      if (!response.ok) {
        const statusCode = response.status;
        if (statusCode === 404) {
          throw new Error(`获取音频文件失败: 文件不存在或地址无效`);
        } else if (statusCode === 403) {
          throw new Error(`获取音频文件失败: 无权访问该文件`);
        } else {
          throw new Error(`获取音频文件失败: ${response.statusText || `状态码 ${statusCode}`}`);
        }
      }
      
      // 获取音频文件的buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // 转换为base64
      const base64Audio = buffer.toString('base64');
      const mimeType = response.headers.get('content-type') || 'audio/wav';
      return `data:${mimeType};base64,${base64Audio}`;
    } catch (error) {
      console.error('获取音频文件失败:', error);
      if (error instanceof Error) {
        throw error; // 保留原始错误消息
      } else {
        throw new Error('获取音频文件失败: 未知错误');
      }
    }
  }

  // 使用硅基流动API克隆语音
  private async callSiliconFlowApi(formData: FormData, apiKey: string): Promise<any> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/uploads/audio/voice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData as any
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // 增强错误处理，特别是针对4xx错误
        if (response.status >= 400 && response.status < 500) {
          throw new Error('语音合成服务商账号未实名认证或API密钥不正确');
        }
        throw new Error(data.error?.message || '语音克隆API调用失败');
      }
      
      return data;
    } catch (error) {
      console.error('硅基流动API调用失败:', error);
      throw error;
    }
  }

  // 从URL克隆语音
  public async cloneVoiceFromUrl(audioUrl: string, text: string, customName: string, model: string, apiKey: string): Promise<any> {
    try {
      // 获取音频并转换为base64
      const base64Audio = await this.fetchAudioAndConvertToBase64(audioUrl);
      
      // 使用转换后的base64进行克隆
      return this.cloneVoiceFromBase64(base64Audio, text, customName, model, apiKey);
    } catch (error) {
      console.error('从URL克隆语音失败:', error);
      if (error instanceof Error) {
        throw error; // 保留原始错误消息
      } else {
        throw new Error('从URL克隆语音失败: 未知错误');
      }
    }
  }

  // 从base64克隆语音
  public async cloneVoiceFromBase64(audio: string, text: string, customName: string, model: string, apiKey: string): Promise<any> {
    try {
      // 创建表单数据
      const formData = new FormData();
      formData.append('audio', audio);
      formData.append('model', model);
      formData.append('customName', customName);
      formData.append('text', text);
      // 调用硅基流动API
      const result = await this.callSiliconFlowApi(formData, apiKey);
      return result;
    } catch (error) {
      console.error('从base64克隆语音失败:', error);
      if (error instanceof Error) {
        throw error; // 保留原始错误消息
      } else {
        throw new Error('从base64克隆语音失败: 未知错误');
      }
    }
  }
} 