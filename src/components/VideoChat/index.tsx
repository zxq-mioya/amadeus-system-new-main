import { useEffect, useRef, useState } from 'react'
import styles from './index.module.less'
import { MessageTypes } from '../../constants'
import { RefreshCw } from 'lucide-react' // 导入图标

interface VideoChatProps {
  sendMessage: (message: { type: MessageTypes; data?: string | string[] }) => void
}

const VideoChat = ({ sendMessage }: VideoChatProps) => {
  const videoElement = useRef<HTMLVideoElement | null>(null)
  const videoContainer = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(true) // 控制是否发送视频帧
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user') // 前置或后置摄像头
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false) // 切换摄像头的状态

  const captureAndSendFrame = () => {
    if (!videoElement.current || !canvasRef.current || !isActive) return

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    if (!context) return

    // 降低分辨率，减小视频帧大小
    canvas.width = 320
    canvas.height = 240
    context.drawImage(videoElement.current, 0, 0, 320, 240)
    
    // 降低图片质量以减小数据量
    const base64Frame = canvas.toDataURL('image/jpeg', 0.6).replace(/^data:image\/jpeg;base64,/, '')
    
    sendMessage({
      type: MessageTypes.VIDEO_FRAME,
      data: base64Frame,
    })
  }

  const getCameraStream = async (mode: 'user' | 'environment' = 'user') => {
    if (isSwitchingCamera) return // 防止重复调用

    setIsSwitchingCamera(true) // 开始切换
    
    // 停止当前流
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null) // 清空当前流，避免黑屏时仍显示旧画面
    }

    try {
      // 首先尝试使用指定的摄像头模式
      const constraints = {
        video: { 
          facingMode: mode,
        },
        audio: false
      }
      
      const newStream = await navigator.mediaDevices.getUserMedia(constraints)
      
      // 确保视频轨道存在且活跃
      if (newStream.getVideoTracks().length === 0 || !newStream.getVideoTracks()[0].enabled) {
        throw new Error('No video track available')
      }
      
      // 设置流并更新视频元素
      setStream(newStream)
      if (videoElement.current) {
        videoElement.current.srcObject = newStream
        // 添加监听器确保视频成功播放
        videoElement.current.onloadedmetadata = () => {
          videoElement.current?.play().catch(e => console.error('视频播放失败:', e))
        }
      }
      setFacingMode(mode) // 更新模式状态
      setIsActive(true)
    } catch (error) {
      console.error('摄像头切换失败:', error)
      // 如果请求的是后置摄像头并失败，尝试回退到前置摄像头
      if (mode === 'environment') {
        console.log('尝试回退到前置摄像头')
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
          })
          
          setStream(fallbackStream)
          if (videoElement.current) {
            videoElement.current.srcObject = fallbackStream
            videoElement.current.onloadedmetadata = () => {
              videoElement.current?.play().catch(e => console.error('视频播放失败:', e))
            }
          }
          setFacingMode('user')
          setIsActive(true)
        } catch (fallbackError) {
          console.error('回退到前置摄像头也失败:', fallbackError)
          setIsActive(false)
        }
      } else {
        setIsActive(false) // 如果无法获取摄像头，禁用视频帧发送
      }
    } finally {
      setIsSwitchingCamera(false) // 切换结束
    }
  }

  // 切换摄像头
  const switchCamera = async () => {
    if (isSwitchingCamera) return // 如果正在切换中，则忽略点击
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    await getCameraStream(newFacingMode)
  }

  const onMouseDown = (e: React.MouseEvent) => {
    // 如果点击的是切换按钮，不启动拖动
    if ((e.target as HTMLElement).closest('.cameraSwitch')) {
      return
    }
    
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const onMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x
      const newY = e.clientY - dragStart.y
      setPosition({ x: newX, y: newY })
    }
  }

  const onMouseUp = () => {
    setIsDragging(false)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // 如果点击的是切换按钮，不启动拖动
    if ((e.target as HTMLElement).closest('.cameraSwitch')) {
      return
    }
    
    setIsDragging(true)
    setDragStart({
      x: e.touches[0].clientX - position.x,
      y: e.touches[0].clientY - position.y
    })
  }

  const onTouchMove = (e: TouchEvent) => {
    if (isDragging) {
      const newX = e.touches[0].clientX - dragStart.x
      const newY = e.touches[0].clientY - dragStart.y
      setPosition({ x: newX, y: newY })
    }
  }

  useEffect(() => {
    getCameraStream(facingMode)
    
    // 发送视频开启状态
    sendMessage({
      type: MessageTypes.VIDEO_STATE,
      data: 'on'
    })
    
    // 减少帧率到每3秒发送一次，减少网络和服务器负担
    const frameInterval = setInterval(captureAndSendFrame, 3000)

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onMouseUp)

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
      // 发送视频关闭状态
      sendMessage({
        type: MessageTypes.VIDEO_STATE,
        data: 'off'
      })
      clearInterval(frameInterval)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onMouseUp)
    }
  }, [isDragging, dragStart, isActive]) // 不要在useEffect依赖中包含facingMode，避免循环

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div
        ref={videoContainer}
        className={styles.videoContainer}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <video ref={videoElement} autoPlay muted playsInline />
        
        {/* 摄像头切换按钮 */}
        <button 
          className={`${styles.cameraSwitch} cameraSwitch ${isSwitchingCamera ? styles.switching : ''}`}
          onClick={switchCamera}
          disabled={isSwitchingCamera}
          aria-label="切换摄像头"
        >
          <RefreshCw size={16} className={isSwitchingCamera ? styles.rotating : ''} />
        </button>
      </div>
    </>
  )
}

export default VideoChat