import { useState, useEffect, useCallback, useRef } from 'react';
import { WebRTCOptions, Live2DModel } from './types';
import { useStore } from '@/store/storeProvider';

interface WebRTCState {
  isConnected: boolean;
  isAudioActive: boolean;
  audioLevel: number;
  transcript: string;
  llmResponse: string;
  error: string | null;
  webrtcId: string | null;
  isMicrophoneMuted: boolean;
}

interface UseWebRTCReturn extends WebRTCState {
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMicrophone: () => void;
}

class WebRTCClient {
  private peerConnection: RTCPeerConnection | null = null;
  private mediaStream: MediaStream | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private options: WebRTCOptions;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrameId: number | null = null;
  private webrtcId: string | null = null;
  private eventSource: EventSource | null = null;
  private apiBaseUrl: string;
  
  // 音频静音检测相关属性
  private silenceThreshold: number = 0.01; // 静音阈值，小于此值视为静音
  private silenceStartTime: number | null = null; // 静音开始时间
  private silenceDuration: number = 2000; // 认为是静音的持续时间阈值，单位为毫秒
  private isSilent: boolean = false; // 当前是否处于静音状态

  // Live2D口型动画相关属性
  private lastMouthOpenY: number = 0;
  private minValue: number = 255;
  private maxValue: number = 0;
  private smoothingFactor: number = 0.3;
  private live2dModel: Live2DModel | null = null;

  private isMicrophoneMuted: boolean = false;

  constructor(options: WebRTCOptions = {}) {
    this.options = options;
    this.apiBaseUrl = options.apiBaseUrl || '/api';
    
    if (options.live2dModel) {
      this.live2dModel = options.live2dModel;
    }
  }

  getWebrtcId(): string | null {
    return this.webrtcId;
  }

  getMicrophoneState(): boolean {
    return !this.isMicrophoneMuted;
  }

  toggleMicrophone(): boolean {
    if (!this.mediaStream) return false;

    const audioTracks = this.mediaStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    this.isMicrophoneMuted = !this.isMicrophoneMuted;
    
    audioTracks.forEach(track => {
      track.enabled = !this.isMicrophoneMuted;
    });

    if (this.options.onMicrophoneToggle) {
      this.options.onMicrophoneToggle(!this.isMicrophoneMuted);
    }

    return true;
  }

  async connect() {
    try {
      // 首先获取 ICE 服务器配置
      const iceConfigResponse = await fetch(`${this.apiBaseUrl}/webrtc/ice-config`, {
        method: 'GET',
        headers: { 
          'Accept': 'application/json'
        },
        mode: 'cors',
        credentials: 'same-origin',
      });
      
      const iceConfig = await iceConfigResponse.json();
      console.log("获取到ICE配置:", iceConfig);

      // 添加ICE候选项收集和状态变化的调试日志
      this.peerConnection = new RTCPeerConnection(iceConfig);
      
      this.peerConnection.addEventListener('icecandidate', event => {
        console.log('ICE候选项:', event.candidate);
      });
      
      this.peerConnection.addEventListener('icecandidateerror', event => {
        console.error('ICE候选项错误:', event);
      });
      
      this.peerConnection.addEventListener('iceconnectionstatechange', () => {
        console.log('ICE连接状态变化:', this.peerConnection?.iceConnectionState);
      });
      
      // 生成唯一的WebRTC ID
      this.webrtcId = Math.random().toString(36).substring(7);
      
      // 将 webrtcId 保存到 localStorage 以便其他组件使用
      localStorage.setItem('webrtc_id', this.webrtcId);
      
      // 通知 webrtcId 已更新
      if (this.options.onWebrtcIdChange) {
        this.options.onWebrtcIdChange(this.webrtcId);
      }
      
      // Get user media
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
      } catch (mediaError: unknown) {
        console.error('Media error:', mediaError);
        if (mediaError instanceof DOMException) {
          if (mediaError.name === 'NotAllowedError') {
            throw new Error('麦克风访问被拒绝。请允许麦克风访问并重试。');
          } else if (mediaError.name === 'NotFoundError') {
            throw new Error('未检测到麦克风。请连接麦克风并重试。');
          }
        }
        throw mediaError;
      }
      
      this.setupAudioAnalysis();
      
      this.mediaStream.getTracks().forEach(track => {
        if (this.peerConnection) {
          this.peerConnection.addTrack(track, this.mediaStream!);
        }
      });
      
      this.peerConnection.addEventListener('track', (event) => {
        if (this.options.onAudioStream) {
          this.options.onAudioStream(event.streams[0]);
        }
        
        // 为远程音频流设置口型动画
        if (this.live2dModel) {
          this.setupLive2dMouthMovement(event.streams[0]);
        }
      });
      
      this.dataChannel = this.peerConnection.createDataChannel('text');
      
      this.dataChannel.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);          
          if (this.options.onMessage) {
            this.options.onMessage(message);
          }
        } catch (error) {
          console.error('解析消息错误:', error);
        }
      });
      
      // Create and send offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      console.log("this.webrtcId", this.webrtcId)
      
      // Use same-origin request to avoid CORS preflight
      const response = await fetch(`${this.apiBaseUrl}/webrtc/offer`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors', // Explicitly set CORS mode
        credentials: 'same-origin',
        body: JSON.stringify({
          sdp: offer.sdp,
          type: offer.type,
          webrtc_id: this.webrtcId
        })
      });
      
      const serverResponse = await response.json();
      await this.peerConnection.setRemoteDescription(serverResponse);
      
      // 连接到服务器事件流
      this.connectToEventStream();
      
      if (this.options.onConnected) {
        this.options.onConnected();
      }
    } catch (error) {
      console.error('连接错误:', error);
      this.disconnect();
      throw error;
    }
  }

  private setupAudioAnalysis() {
    if (!this.mediaStream) return;
    
    try {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      this.startAnalysis();
    } catch (error) {
      console.error('设置音频分析错误:', error);
    }
  }

  private setupLive2dMouthMovement(audioStream: MediaStream) {
    if (!this.live2dModel || !audioStream) return;
    
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });
      }
      
      const remoteAnalyser = this.audioContext.createAnalyser();
      remoteAnalyser.fftSize = 2048;
      
      const source = this.audioContext.createMediaStreamSource(audioStream);
      source.connect(remoteAnalyser);
      
      // 安全地访问模型属性
      const model = this.live2dModel;
      if (model?.internalModel?.coreModel?.setParameterValueById) {
        model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
      }
      
      // 开始口型动画分析
      this.startLive2DMouthAnimation(remoteAnalyser);

      // 启动音频静音检测
      this.startSilenceDetection(remoteAnalyser);
    } catch (error) {
      console.error('设置Live2D口型动画失败:', error);
    }
  }

  private startLive2DMouthAnimation(analyser: AnalyserNode) {
    if (!this.live2dModel || !analyser) return;
    
    const updateMouthMovement = () => {
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);
      
      const arr = [];
      const step = 40;
      for (let i = 0; i < 600; i += step) {
        arr.push(frequencyData[i]);
      }
      
      const averageFrequency = arr.reduce((sum, val) => sum + val, 0) / arr.length;
      
      this.minValue = Math.min(this.minValue, averageFrequency);
      this.maxValue = Math.max(this.maxValue, averageFrequency);
      
      this.minValue += 0.05;
      this.maxValue -= 0.05;
      
      if (this.maxValue - this.minValue < 50) {
        const mid = (this.maxValue + this.minValue) / 2;
        this.minValue = mid - 15;
        this.maxValue = mid + 15;
      }
      
      let normalizedValue = (averageFrequency - this.minValue) / (this.maxValue - this.minValue);
      normalizedValue = Math.max(0, Math.min(1, normalizedValue));
      
      const smoothedValue = this.lastMouthOpenY + this.smoothingFactor * (normalizedValue - this.lastMouthOpenY);
      this.lastMouthOpenY = smoothedValue;
      
      if (smoothedValue > 0 && smoothedValue < 1 && this.live2dModel?.internalModel?.coreModel?.setParameterValueById) {
        this.live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', smoothedValue);
      }
      
      this.animationFrameId = requestAnimationFrame(updateMouthMovement);
    };
    
    this.animationFrameId = requestAnimationFrame(updateMouthMovement);
  }

  // 添加音频静音检测方法
  private startSilenceDetection(analyser: AnalyserNode) {
    if (!analyser) return;
    
    // 添加一个标志，表示当前静音是否已触发过回调
    let hasSilenceTriggered = false;
    // 添加一个标志，表示是否已经开始进行静音检测
    let hasAudioActivityDetected = false;
    
    const detectSilence = () => {
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);
      
      // 计算音频电平
      let sum = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        sum += frequencyData[i];
      }
      const audioLevel = sum / frequencyData.length / 255;
      this.lastAudioLevel = audioLevel;
      
      const currentTime = Date.now();
      
      // 首先检查是否有音频活动开始检测
      if (!hasAudioActivityDetected && audioLevel >= this.silenceThreshold) {
        // 检测到音频活动，开始进行静音检测
        hasAudioActivityDetected = true;
        console.log('检测到首次音频活动，开始进行静音检测');
      }
      
      // 只有当已经检测到首次音频活动后，才进行静音检测
      if (hasAudioActivityDetected) {
        // 检测静音
        if (audioLevel < this.silenceThreshold) {
          // 如果之前不是静音状态，记录静音开始时间
          if (!this.isSilent) {
            this.silenceStartTime = currentTime;
            this.isSilent = true;
          } 
          // 如果已经是静音状态，并且尚未触发过回调，检查是否超过阈值
          else if (this.silenceStartTime && !hasSilenceTriggered && 
                  (currentTime - this.silenceStartTime >= this.silenceDuration)) {
            if (this.options.onAudioSilence) {
              this.options.onAudioSilence();
              // 设置标志，表示已触发过回调，防止重复触发
              hasSilenceTriggered = true;
            }
          }
        } else {
          // 如果检测到音频活动，重置静音状态和触发标志
          this.isSilent = false;
          this.silenceStartTime = null;
          hasSilenceTriggered = false;
        }
      }
      
      // 继续检测
      requestAnimationFrame(detectSilence);
    };
    
    requestAnimationFrame(detectSilence);
  }

  private startAnalysis() {
    if (!this.analyser || !this.dataArray || !this.options.onAudioLevel) return;
    
    // Add throttling to prevent too many updates
    let lastUpdateTime = 0;
    const throttleInterval = 100; // Only update every 100ms
    
    const analyze = () => {
      this.analyser!.getByteFrequencyData(this.dataArray!);
      
      const currentTime = Date.now();
      // Only update if enough time has passed since last update
      if (currentTime - lastUpdateTime > throttleInterval) {
        // Calculate average volume level (0-1)
        let sum = 0;
        for (let i = 0; i < this.dataArray!.length; i++) {
          sum += this.dataArray![i];
        }
        const average = sum / this.dataArray!.length / 255;
        
        this.options.onAudioLevel!(average);
        lastUpdateTime = currentTime;
      }
      
      this.animationFrameId = requestAnimationFrame(analyze);
    };
    
    this.animationFrameId = requestAnimationFrame(analyze);
  }

  private stopAnalysis() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.dataArray = null;
    
    // 重置静音检测状态
    this.isSilent = false;
    this.silenceStartTime = null;
    
    // 重置Live2D口型
    if (this.live2dModel?.internalModel?.coreModel?.setParameterValueById) {
      this.live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
    }
  }

  // 连接到服务器事件流的方法
  private connectToEventStream() {
    if (!this.webrtcId) return;
    
    // 关闭现有的EventSource
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    // 创建新的EventSource
    this.eventSource = new EventSource(`${this.apiBaseUrl}/events?webrtc_id=${this.webrtcId}`);
    
    // 监听message事件
    this.eventSource.addEventListener('message', (event) => {
      try {
        const eventData = JSON.parse(event.data);
        console.log('从SSE接收到事件:', eventData);
        
        if (this.options.onEvent) {
          this.options.onEvent(eventData.type, eventData.data);
        }
        
        // 处理不同类型的事件
        switch (eventData.type) {
          case 'error':
            // 如果是错误消息，调用onError回调
            if (this.options.onError) {
              this.options.onError(String(eventData.data));
            }
            break;
          case 'llm_response':
            // 如果是LLM响应，调用onLLMResponse回调
            if (this.options.onLLMResponse) {
              this.options.onLLMResponse(eventData.data as string);
            }
            break;
          case 'llm_stream':
            // 如果是LLM流式响应片段，调用onLLMStream回调
            if (this.options.onLLMStream) {
              this.options.onLLMStream(eventData.data as string);
            }
            break;
          case 'transcript':
            // 如果是用户语音转文字，调用onTranscript回调
            if (this.options.onTranscript) {
              this.options.onTranscript(eventData.data as string);
            }
            break;
          case 'emotion_response':
            // 如果是情感分析响应，调用onEmotionResponse回调
            if (this.options.onEmotionResponse) {
              this.options.onEmotionResponse(eventData.data as string);
            }
            break;
          case 'next_action':
            // 如果是下一步行动计划，调用onNextAction回调
            if (this.options.onNextAction) {
              this.options.onNextAction(eventData.data as string);
            }
            break;
          // 可以添加更多的事件类型处理
        }
      } catch (error) {
        console.error('解析事件数据错误:', error);
      }
    });
    
    // 监听错误事件
    this.eventSource.addEventListener('error', (event) => {
      // 由于SSE错误事件可能没有data属性，我们不尝试解析它
      console.error('SSE错误:', event);
    });
    
    // 监听连接打开事件
    this.eventSource.onopen = () => {
      console.log('SSE连接已打开');
    };
  }

  disconnect() {
    this.stopAnalysis();
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    this.dataChannel = null;
    
    // 关闭EventSource
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.webrtcId = null;
    
    if (this.options.onDisconnected) {
      this.options.onDisconnected();
    }
    
    // 清除localStorage中的webrtcId
    localStorage.removeItem('webrtc_id');
  }
}

export function useWebRTC(options: WebRTCOptions = {}): UseWebRTCReturn {
  const { live2dStore } = useStore();
  const [state, setState] = useState<WebRTCState>({
    isConnected: false,
    isAudioActive: false,
    audioLevel: 0,
    transcript: '',
    llmResponse: '',
    error: null,
    webrtcId: null,
    isMicrophoneMuted: false
  });
  
  const webrtcRef = useRef<WebRTCClient | null>(null);
  const optionsRef = useRef(options);
  
  // 更新options引用，避免不必要的重新创建
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  // 初始化WebRTC客户端
  useEffect(() => {
    // 使用函数封装回调，避免在每次渲染时创建新函数
    const createCallbacks = () => {
      return {
        onConnected: () => {
          setState(prev => ({ 
            ...prev, 
            isConnected: true,
            webrtcId: webrtcRef.current?.getWebrtcId() || null
          }));
          optionsRef.current.onConnected?.();
        },
        onDisconnected: () => {
          setState(prev => ({ 
            ...prev, 
            isConnected: false,
            isAudioActive: false,
            webrtcId: null
          }));
          optionsRef.current.onDisconnected?.();
        },
        onAudioLevel: (level: number) => {
          setState(prev => ({ ...prev, audioLevel: level }));
          optionsRef.current.onAudioLevel?.(level);
        },
        onAudioStream: (stream: MediaStream) => {
          setState(prev => ({ ...prev, isAudioActive: true }));
          optionsRef.current.onAudioStream?.(stream);
        },
        onTranscript: (text: string) => {
          setState(prev => ({ ...prev, transcript: text }));
          optionsRef.current.onTranscript?.(text);
        },
        onLLMResponse: (text: string) => {
          setState(prev => ({ ...prev, llmResponse: text }));
          optionsRef.current.onLLMResponse?.(text);
        },
        onLLMStream: (text: string) => {
          setState(prev => ({ ...prev, llmResponse: prev.llmResponse + text }));
          optionsRef.current.onLLMStream?.(text);
        },
        onEmotionResponse: (emotion: string) => {
          // 不需要更新state，我们只传递给回调函数
          optionsRef.current.onEmotionResponse?.(emotion);
        },
        onError: (errorMessage: string) => {
          setState(prev => ({ ...prev, error: errorMessage }));
          optionsRef.current.onError?.(errorMessage);
        },
        onWebrtcIdChange: (webrtcId: string) => {
          setState(prev => ({ ...prev, webrtcId }));
          optionsRef.current.onWebrtcIdChange?.(webrtcId);
        },
        onAudioSilence: () => {
          // 这里不需要更新state，只调用外部回调
          optionsRef.current.onAudioSilence?.();
        },
        onNextAction: (action: string) => {
          // 处理下一步行动计划回调
          console.log('收到下一步行动计划:', action);
          optionsRef.current.onNextAction?.(action);
        },
        onMicrophoneToggle: (isActive: boolean) => {
          // 处理麦克风状态变化
          setState(prev => ({ ...prev, isMicrophoneMuted: !isActive }));
          optionsRef.current.onMicrophoneToggle?.(isActive);
        }
      };
    };
    
    const callbacks = createCallbacks();
    
    const webrtcOptions: WebRTCOptions = {
      ...optionsRef.current,
      live2dModel: live2dStore.model || undefined,
      ...callbacks
    };
    
    webrtcRef.current = new WebRTCClient(webrtcOptions);
    
    return () => {
      if (webrtcRef.current) {
        webrtcRef.current.disconnect();
        webrtcRef.current = null;
      }
    };
  }, [live2dStore.model]); // 只依赖live2dModel变化
  
  // 连接方法
  const connect = useCallback(async () => {
    if (webrtcRef.current) {
      try {
        setState(prev => ({ ...prev, error: null }));
        await webrtcRef.current.connect();
      } catch (error) {
        setState(prev => ({ 
          ...prev, 
          error: error instanceof Error ? error.message : '连接失败'
        }));
        throw error;
      }
    }
  }, []);
  
  // 断开连接方法
  const disconnect = useCallback(() => {
    if (webrtcRef.current) {
      webrtcRef.current.disconnect();
    }
  }, []);
  
  // 切换麦克风状态的函数
  const toggleMicrophone = useCallback(() => {
    if (webrtcRef.current) {
      const result = webrtcRef.current.toggleMicrophone();
      return result;
    }
    return false;
  }, []);
  
  return {
    ...state,
    connect,
    disconnect,
    toggleMicrophone
  };
} 