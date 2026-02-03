import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Pause, Upload, Wand2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface VoiceCard {
  id: string;
  name: string;
  audioUrl: string;
  referenceText: string;
}

interface VoiceCloneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoiceSelected: (voiceId: string) => void;
  apiKey: string;
}

const predefinedVoices: VoiceCard[] = [
  {
    id: 'voice_kurisu',
    name: '牧濑红莉栖',
    audioUrl: 'https://file.amadeus-web.top/d/%E7%BA%A2%E8%8E%89%E6%A0%96.wav',
    referenceText: "ふんよくも私の正体を聞けたものだ私はマセ効率世界で最も才能のある女性科学者よでもクリスチーナって呼ばないでそのニックネームは好きじゃないのよ何か質問があるなら彼らに聞いてちょうだいあなたとおしゃべりする時間なんてそうそうないんだから"
  },
];

// 使用本地中转API
const apiProxyUrl = '/node/api/voice-clone';
const defaultModel = 'FunAudioLLM/CosyVoice2-0.5B';

const VoiceCloneModal = ({ open, onOpenChange, onVoiceSelected, apiKey }: VoiceCloneModalProps) => {
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [audioElements, setAudioElements] = useState<{[key: string]: HTMLAudioElement | null}>({});
  const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
  const [customAudioName, setCustomAudioName] = useState('');
  const [customReferenceText, setCustomReferenceText] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  // 处理音频播放和暂停
  const handleTogglePlay = (voiceId: string, audioUrl: string) => {
    if (!audioElements[voiceId]) {
      const audio = new Audio(audioUrl);
      audio.addEventListener('ended', () => setPlayingAudio(null));
      setAudioElements(prev => ({ ...prev, [voiceId]: audio }));
      audio.play();
      setPlayingAudio(voiceId);
    } else {
      const audio = audioElements[voiceId];
      if (playingAudio === voiceId) {
        audio?.pause();
        setPlayingAudio(null);
      } else {
        // 先暂停当前播放的音频
        if (playingAudio && audioElements[playingAudio]) {
          audioElements[playingAudio]?.pause();
        }
        audio?.play();
        setPlayingAudio(voiceId);
      }
    }
  };

  // 处理自定义音频文件上传
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCustomAudioFile(file);
      
      // 如果没有自定义名称，使用文件名
      if (!customAudioName) {
        const fileName = file.name.split('.')[0];
        setCustomAudioName(fileName);
      }
      
      // 创建URL并设置音频
      const audioUrl = URL.createObjectURL(file);
      if (audioElements['custom']) {
        URL.revokeObjectURL(audioElements['custom']?.src || '');
      }
      
      const audio = new Audio(audioUrl);
      audio.addEventListener('ended', () => setPlayingAudio(null));
      setAudioElements(prev => ({ ...prev, custom: audio }));
    }
  };

  // 将文件转换为base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = error => reject(error);
    });
  };

  // 处理克隆按钮点击
  const handleClone = async (voiceId: string) => {
    if (!apiKey) {
      setErrorMessage('请先设置语音合成API密钥');
      return;
    }

    setIsCloning(true);
    setErrorMessage('');
    setStatusMessage('开始处理语音克隆...');
    
    try {
      // 查找对应的预定义语音
      const selectedVoice = predefinedVoices.find(voice => voice.id === voiceId);
      
      if (!selectedVoice) {
        throw new Error('未找到对应的语音模板');
      }
      
      setStatusMessage('正在进行语音克隆...');
      
      // 使用中转接口处理
      const response = await fetch(`${apiProxyUrl}/clone-from-url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audioUrl: selectedVoice.audioUrl,
          text: selectedVoice.referenceText,
          customName: selectedVoice.id,
          model: defaultModel
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || '语音克隆失败');
      }
      console.log(data.uri);
      // 处理成功响应
      const clonedVoiceId = data.uri;
      setStatusMessage('语音克隆成功!');
      
      // 克隆成功后，返回voiceId给父组件
      onVoiceSelected(clonedVoiceId);
      onOpenChange(false);
    } catch (error) {
      console.error('语音克隆失败:', error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(`语音克隆失败: ${errorMsg}`);
    } finally {
      setIsCloning(false);
    }
  };

  // 处理自定义音频克隆
  const handleCustomClone = async () => {
    if (!apiKey) {
      setErrorMessage('请先设置语音合成API密钥');
      return;
    }

    if (!customAudioFile) {
      setErrorMessage('请先上传参考语音');
      return;
    }

    if (!customAudioName) {
      setErrorMessage('请输入声音名称');
      return;
    }

    if (!customReferenceText) {
      setErrorMessage('请输入语音参考文字');
      return;
    }

    setIsCloning(true);
    setErrorMessage('');
    setStatusMessage('正在处理语音克隆...');
    
    try {
      // 将音频文件转换为 base64
      const base64Audio = await fileToBase64(customAudioFile);
      
      // 使用中转接口处理
      const response = await fetch(`${apiProxyUrl}/clone-from-base64`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio: base64Audio,
          text: customReferenceText,
          customName: customAudioName,
          model: defaultModel
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || '语音克隆失败');
      }

      // 处理成功响应
      const clonedVoiceId = data.uri;
      setStatusMessage('语音克隆成功!');
      
      // 克隆成功后，返回自定义voiceId给父组件
      onVoiceSelected(clonedVoiceId);
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('自定义语音克隆失败:', error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(`自定义语音克隆失败: ${errorMsg}`);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>选择语音克隆模板</DialogTitle>
        </DialogHeader>
        
        {/* 状态和错误信息 */}
        {statusMessage && (
          <Alert className="mt-2">
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}
        
        {errorMessage && (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* 预定义语音卡片 */}
          {predefinedVoices.map((voice) => (
            <div key={voice.id} className="border rounded-lg p-4 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-lg">{voice.name}</h3>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleTogglePlay(voice.id, voice.audioUrl)}
                >
                  {playingAudio === voice.id ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button 
                className="mt-auto"
                variant="default"
                onClick={() => handleClone(voice.id)}
                disabled={isCloning}
              >
                {isCloning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    正在克隆...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    一键克隆
                  </>
                )}
              </Button>
            </div>
          ))}
          
          {/* 自定义语音卡片 */}
          <div className="border rounded-lg p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-lg">自定义语音</h3>
              {customAudioFile && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => audioElements['custom'] && handleTogglePlay('custom', audioElements['custom'].src)}
                  disabled={!customAudioFile}
                >
                  {playingAudio === 'custom' ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
            
            <div className="mb-4">
              <Label htmlFor="custom-voice-name" className="mb-2 block">声音名称</Label>
              <Input
                id="custom-voice-name"
                value={customAudioName}
                onChange={(e) => setCustomAudioName(e.target.value)}
                placeholder="输入自定义声音名称"
                className="mb-2"
              />
              <Label htmlFor="custom-reference-text" className="mb-2 block">语音参考文字</Label>
              <Input
                id="custom-reference-text"
                value={customReferenceText}
                onChange={(e) => setCustomReferenceText(e.target.value)}
                placeholder="输入与参考语音相匹配的文字内容"
                className="mb-2"
              />
              <Label htmlFor="custom-voice-file" className="mb-2 block">上传参考语音 (MP3或WAV格式)</Label>
              <div className="flex gap-2">
                <Input
                  id="custom-voice-file"
                  type="file"
                  accept="audio/mp3,audio/wav"
                  onChange={handleFileChange}
                  className="text-sm"
                  disabled={isCloning}
                />
              </div>
            </div>
            
            <Button 
              className="mt-auto"
              onClick={handleCustomClone} 
              disabled={!customAudioFile || !customAudioName || !customReferenceText || isCloning}
            >
              {isCloning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  正在处理...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  上传并克隆
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceCloneModal; 