import { app, BrowserWindow, Menu, Tray, globalShortcut, protocol, ipcMain, dialog } from 'electron';
import path from 'path';//处理路径的 Node 核心模块
import { fork, exec } from 'child_process';//从主进程里启动子进程（这里用来跑 Node 服务，和杀掉子进程）
import logPkg from 'electron-log';
const log = logPkg.default || logPkg;
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
// 引入创建静态服务器所需的模块
import http from 'http';
import { createReadStream } from 'fs';
// 引入自动更新模块
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
// 获取 __dirname 等效
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 根据是否打包使用不同的根目录
const rootPath = app.isPackaged ? process.resourcesPath : __dirname;

let mainWindow;
let loadingWindow; // 新增加载窗口
let tray;
let isAlwaysOnTop = false;
let staticServer; // 静态服务器实例

// 配置自动更新
function setupAutoUpdater() {
  // 配置日志
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
  log.info('自动更新已配置');

  autoUpdater.on('error', (error) => {
    log.error('更新检查失败', error);
  });

  // 检测到新版本
  autoUpdater.on('update-available', (info) => {
    log.info('发现新版本:', info);
    if (app.isPackaged && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '有可用更新',
        message: `发现新版本 ${info.version}，正在下载...`,
        detail: '下载完成后将自动提示安装'
      });
    }
  });

  // 没有新版本
  autoUpdater.on('update-not-available', (info) => {
    log.info('当前已是最新版本:', info);
    // 可选：如果是手动检查，则显示对话框
    if (global.isManualCheck && app.isPackaged && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '无可用更新',
        message: '您当前使用的已经是最新版本'
      });
      global.isManualCheck = false;
    }
  });

  // 下载进度 - 在主进程中记录日志，但不显示给用户
  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `下载速度: ${progressObj.bytesPerSecond} - 已下载 ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);
  });

  // 下载完成，准备安装
  autoUpdater.on('update-downloaded', (info) => {
    log.info('更新已下载，准备安装:', info);
    
    if (app.isPackaged && mainWindow) {
      // 显示安装对话框
      const dialogOpts = {
        type: 'info',
        buttons: ['立即重启', '稍后'],
        title: '应用更新',
        message: '发现新版本并已下载完成，重启应用以完成更新。',
        detail: `新版本: ${info.version}`
      };

      dialog.showMessageBox(mainWindow, dialogOpts).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  // 添加托盘菜单选项，用于检查更新
  ipcMain.handle('check-for-updates', () => {
    if (app.isPackaged) {
      log.info('手动检查更新');
      global.isManualCheck = true; // 标记为手动检查
      autoUpdater.checkForUpdates();
    } else {
      log.info('开发环境不检查更新');
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: '开发模式',
        message: '开发模式下不检查更新'
      });
    }
  });

  // 自动检查更新
  if (app.isPackaged) {
    // 延迟几秒后检查更新，让应用先启动起来
    setTimeout(() => {
      log.info('自动检查更新');
      autoUpdater.checkForUpdates();
    }, 5000);
  }
}

// 加载环境变量（注意：打包后 .env 文件应放置在 extraResources 中的 service 目录内）
function loadEnv() {
  let defaultEnv;
  if (app.isPackaged) {
    // 打包后，我们把 service 目录作为 extraResources 打包到 resources 目录
    defaultEnv = path.join(process.resourcesPath, 'service', '.env');
  } else {
    defaultEnv = path.resolve(__dirname, '../service/.env');
  }
  log.info(`加载环境变量: ${defaultEnv}`);
  dotenv.config({ path: defaultEnv });
}

// 获取图标路径时使用正确的根路径
function getIconPath() {
  const iconCandidates = !app.isPackaged ? [
    path.join(__dirname, './build/icon.png'),
    path.join(__dirname, './build/icon.ico')
  ] : [
    path.join(process.resourcesPath, 'icon', 'icon.png'),
    path.join(process.resourcesPath, 'icon', 'icon.ico')
  ];
  for (const iconPath of iconCandidates) {
    if (fs.existsSync(iconPath)) return iconPath;
  }
  return undefined;
}

// 创建一个简单的 MIME 类型映射
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

// 替换 mime.lookup 函数
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

// 启动静态文件服务器
function startStaticServer() {
  return new Promise((resolve, reject) => {
    log.info('正在启动静态服务器...');
    
    // 确定静态文件目录路径
    const distPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'dist') 
      : path.join(__dirname, '../dist');
    
    // 默认端口
    const PORT = 4173;
    
    // 创建HTTP服务器
    staticServer = http.createServer((req, res) => {
      // 解析请求URL路径
      let urlPath = req.url;
      
      // 如果URL是根路径或者不存在，默认提供index.html
      if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
      }
      
      // 构建文件的完整路径
      const filePath = path.join(distPath, urlPath);
      
      // 检查文件是否存在
      fs.access(filePath, fs.constants.R_OK, (err) => {
        if (err) {
          // 如果文件不存在，提供index.html（支持单页应用的路由）
          if (err.code === 'ENOENT') {
            const indexPath = path.join(distPath, 'index.html');
            
            // 再次检查index.html是否存在
            fs.access(indexPath, fs.constants.R_OK, (err) => {
              if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
              }
              
              // 设置内容类型
              res.setHeader('Content-Type', 'text/html');
              
              // 流式传输文件内容
              const fileStream = createReadStream(indexPath);
              fileStream.pipe(res);
              
              fileStream.on('error', (error) => {
                log.error(`文件读取错误: ${error}`);
                res.writeHead(500);
                res.end('Internal server error');
              });
            });
            return;
          }
          
          // 其他错误
          res.writeHead(500);
          res.end('Internal server error');
          return;
        }
        
        // 确定文件的MIME类型
        const contentType = getMimeType(filePath);
        res.setHeader('Content-Type', contentType);
        
        // 流式传输文件内容
        const fileStream = createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
          log.error(`文件读取错误: ${error}`);
          res.writeHead(500);
          res.end('Internal server error');
        });
      });
    });
    
    // 监听错误
    staticServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log.warn(`端口 ${PORT} 已被占用，尝试其他端口`);
        // 端口被占用，可以在这里尝试使用其他端口
        const alternativePorts = [5173, 8080, 8000, 3000];
        tryAlternativePorts(alternativePorts, 0, distPath, resolve, reject);
      } else {
        log.error(`静态服务器错误: ${err}`);
        reject(err);
      }
    });
    
    // 启动服务器
    staticServer.listen(PORT, '127.0.0.1', () => {
      global.previewPort = PORT.toString();
      log.info(`静态服务器已启动在端口 ${PORT}，为目录 ${distPath} 提供服务`);
      resolve(PORT.toString());
    });
  });
}

// 尝试备用端口
function tryAlternativePorts(ports, index, distPath, resolve, reject) {
  if (index >= ports.length) {
    reject(new Error('所有备用端口都被占用'));
    return;
  }
  
  const PORT = ports[index];
  
  // 关闭之前的服务器实例
  if (staticServer) {
    staticServer.close();
  }
  
  // 创建新的服务器实例
  staticServer = http.createServer((req, res) => {
    // 解析请求URL路径
    let urlPath = req.url;
    
    // 如果URL是根路径或者不存在，默认提供index.html
    if (urlPath === '/' || urlPath === '') {
      urlPath = '/index.html';
    }
    
    // 构建文件的完整路径
    const filePath = path.join(distPath, urlPath);
    
    // 检查文件是否存在
    fs.access(filePath, fs.constants.R_OK, (err) => {
      if (err) {
        // 如果文件不存在，提供index.html（支持单页应用的路由）
        if (err.code === 'ENOENT') {
          const indexPath = path.join(distPath, 'index.html');
          
          // 再次检查index.html是否存在
          fs.access(indexPath, fs.constants.R_OK, (err) => {
            if (err) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }
            
            // 设置内容类型
            res.setHeader('Content-Type', 'text/html');
            
            // 流式传输文件内容
            const fileStream = createReadStream(indexPath);
            fileStream.pipe(res);
            
            fileStream.on('error', (error) => {
              log.error(`文件读取错误: ${error}`);
              res.writeHead(500);
              res.end('Internal server error');
            });
          });
          return;
        }
        
        // 其他错误
        res.writeHead(500);
        res.end('Internal server error');
        return;
      }
      
      // 确定文件的MIME类型
      const contentType = getMimeType(filePath);
      res.setHeader('Content-Type', contentType);
      
      // 流式传输文件内容
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);
      
      fileStream.on('error', (error) => {
        log.error(`文件读取错误: ${error}`);
        res.writeHead(500);
        res.end('Internal server error');
      });
    });
  });
  
  staticServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.warn(`备用端口 ${PORT} 也被占用，尝试下一个端口`);
      tryAlternativePorts(ports, index + 1, distPath, resolve, reject);
    } else {
      reject(err);
    }
  });
  
  staticServer.listen(PORT, '127.0.0.1', () => {
    global.previewPort = PORT.toString();
    log.info(`静态服务器已启动在备用端口 ${PORT}，为目录 ${distPath} 提供服务`);
    resolve(PORT.toString());
  });
}

// 创建加载窗口
function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 加载HTML文件
  const loadingHtmlPath = app.isPackaged
    ? path.join(process.resourcesPath, 'electron', 'loading.html')
    : path.join(__dirname, 'loading.html');
  
  // 检查文件是否存在
  if (fs.existsSync(loadingHtmlPath)) {
    loadingWindow.loadFile(loadingHtmlPath);
  } else {
    // 如果文件不存在，创建一个简单的备用加载界面
    const tempPath = path.join(app.getPath('temp'), 'loading.html');
    fs.writeFileSync(tempPath, `
      <html>
        <body style="background: #0a0f1e; color: white; font-family: Arial; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
          <div style="text-align: center;">
            <h2>AMADEUS SYSTEM</h2>
            <p id="status">正在初始化系统...</p>
            <script>
              const { ipcRenderer } = require('electron');
              ipcRenderer.on('loading-status', (event, message) => {
                document.getElementById('status').innerText = message;
              });
            </script>
          </div>
        </body>
      </html>
    `);
    loadingWindow.loadFile(tempPath);
  }
  
  loadingWindow.center();
  return loadingWindow;
}

// 更新加载状态
function updateLoadingStatus(message) {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.webContents.send('loading-status', message);
  }
}

// 创建主窗口
function createWindow() {
  const windowOptions = {
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    show: false, // 初始不显示，等加载完成后显示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: fs.existsSync(path.join(rootPath, 'preload.mjs'))
        ? path.join(rootPath, 'preload.mjs')
        : undefined
    }
  };
  const iconPath = getIconPath();
  if (iconPath) windowOptions.icon = iconPath;

  mainWindow = new BrowserWindow(windowOptions);

  // 等待页面加载完成后再显示
  mainWindow.once('ready-to-show', () => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close();
    }
    mainWindow.show();
  });

  // 处理加载错误
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log.error(`页面加载失败: ${errorDescription} (${errorCode})`);
    
    // 如果连接被拒绝，可能是端口错误，尝试其他常见端口
    if (errorCode === -102) { // ERR_CONNECTION_REFUSED
      const fallbackPorts = ['4173', '5173', '8080'];
      if (!fallbackPorts.includes(port)) {
        fallbackPorts.unshift(port);
      }
      
      const currentIndex = fallbackPorts.indexOf(port);
      const nextIndex = (currentIndex + 1) % fallbackPorts.length;
      const nextPort = fallbackPorts[nextIndex];
      
      log.info(`尝试连接到备用端口: ${nextPort}`);
      global.previewPort = nextPort;
      mainWindow.loadURL(`http://127.0.0.1:${nextPort}`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = getIconPath();
  if (!iconPath) {
    log.warn('未找到托盘图标，跳过托盘创建');
    return;
  }
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主界面', click: () => { if (mainWindow) mainWindow.show(); } },
    { label: '检查更新', click: () => { 
      if (mainWindow) {
        global.isManualCheck = true;
        autoUpdater.checkForUpdates();
      } 
    }},
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } }
  ]);
  tray.setToolTip(app.name);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// 启动 node 中间层（service/build/index.mjs）
// 根据是否打包选择正确路径
const nodeServerPath = app.isPackaged 
  ? path.join(process.resourcesPath, 'service', 'build', 'index.js')
  : path.join(__dirname, '../service/build/index.mjs');

// 启动 Node 服务并返回 Promise
function startNodeService() {
  return new Promise((resolve, reject) => {
    log.info('正在启动 Node 服务...');
    log.info(`cwd: ${app.isPackaged ? path.join(process.resourcesPath, 'service') : path.resolve(__dirname, '../service')}`);
    log.info(`nodeServerPath: ${nodeServerPath}`);
    // 确保可以正确fork ESM模块
    const nodeProcess = fork(nodeServerPath, [], { 
      stdio: 'inherit',
      execArgv: ['--experimental-specifier-resolution=node'],
      cwd: app.isPackaged 
        ? path.join(process.resourcesPath, 'service')
        : path.resolve(__dirname, '../service'),
      env: { ...process.env, NODE_ENV: 'production' },
    });
    
    // 检查服务是否已经启动
    const checkServiceAvailable = async () => {
      try {
        // 尝试连接到服务，不关心响应状态码
        await fetch('http://127.0.0.1:3002/', { 
          method: 'GET',
          timeout: 1000
        });
        
        // 只要没有抛出异常，就表示服务已响应
        log.info('Node 服务已响应请求，视为已启动');
        clearTimeout(timeout);
        resolve(nodeProcess);
        return true;
      } catch (err) {
        // 连接失败，服务可能还未启动
        return false;
      }
    };
    
    // 定期检查服务是否可用
    const checkInterval = setInterval(async () => {
      const isAvailable = await checkServiceAvailable();
      if (isAvailable) {
        clearInterval(checkInterval);
      }
    }, 2000); // 每2秒检查一次
    
    // 设置超时
    const timeout = setTimeout(() => {
      log.warn('Node 服务启动超时，继续执行');
      clearInterval(checkInterval);
      resolve(nodeProcess);
    }, 10000); // 10秒超时
    // 捕获子进程的标准输出
    nodeProcess.on('error', (err) => {
      clearTimeout(timeout);
      clearInterval(checkInterval);
      log.error(`Node 服务启动错误: ${err}`);
      reject(err);
    });
    
    nodeProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        log.error(`Node 服务异常退出，退出码: ${code}`);
        reject(new Error(`Node 服务异常退出，退出码: ${code}`));
      }
    });
  });
}

// 添加全局错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  log.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  log.error('未处理的Promise拒绝:', reason);
});

// 优雅关闭所有子进程
function cleanupProcesses() {
  log.info('开始清理子进程...');
  
  // 关闭 Node 服务进程
  if (global.nodeProcess) {
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${global.nodeProcess.pid} /T /F`, (error) => {
          if (error) log.error(`终止Node服务进程失败: ${error}`);
          else log.info(`成功终止Node服务进程: ${global.nodeProcess.pid}`);
        });
      } else {
        global.nodeProcess.kill('SIGKILL');
      }
    } catch (err) {
      log.error(`终止Node服务进程时出错: ${err}`);
    }
  }
  
  // 关闭静态服务器
  if (staticServer) {
    try {
      staticServer.close();
      log.info('静态服务器已关闭');
    } catch (err) {
      log.error(`关闭静态服务器时出错: ${err}`);
    }
  }
}

// 在createWindow函数后面添加创建应用菜单的函数
function createAppMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'delete', label: '删除' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '检查更新',
          click: () => {
            global.isManualCheck = true;
            autoUpdater.checkForUpdates();
          }
        },
        { type: 'separator' },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: app.name,
              detail: `版本: ${app.getVersion()}\n描述: Her.AI Alpha Application inspired by Steins;Gate 0`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 应用启动流程
app.whenReady().then(async () => {
  loadEnv();
  
  // 创建加载窗口
  createLoadingWindow();
  
  // 注册协议处理程序
  if (app.isPackaged) {
    app.on('web-contents-created', (e, contents) => {
      contents.on('will-navigate', (event, url) => {
        if (url.startsWith('file:')) {
          event.preventDefault();
        }
      });
    });
  } else {
    protocol.registerFileProtocol('file', (request, callback) => {
      const pathname = decodeURI(request.url.replace('file:///', ''));
      callback(pathname);
    });
  }

  try {
    // 启动静态服务器
    updateLoadingStatus('正在启动静态服务器...');
    const port = await startStaticServer();
    log.info(`静态服务器已启动在端口 ${port}`);
    
    // 启动 Node 服务
    updateLoadingStatus('正在启动应用服务...');
    global.nodeProcess = await startNodeService();
    log.info('Node 服务已成功启动，准备创建窗口');
    
    // 创建主窗口并加载 URL
    updateLoadingStatus('正在加载应用界面...');
    createWindow();
    createTray();
    createAppMenu(); // 添加创建应用菜单
    
    // 设置自动更新
    setupAutoUpdater();
    
    // 加载应用URL
    mainWindow.loadURL(`http://127.0.0.1:3002`);
  } catch (err) {
    log.error('启动服务失败:', err);
    updateLoadingStatus(`启动失败: ${err.message}`);
    
    // 等待几秒钟让用户看到错误信息
    setTimeout(() => {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
      }
      
      global.previewPort = '3002'; // 使用默认端口
      createWindow(); // 仍然创建窗口，但可能无法正常工作
      mainWindow.loadURL(`http://127.0.0.1:3002`);
      createTray();
      createAppMenu(); // 添加创建应用菜单
      
      // 设置自动更新
      setupAutoUpdater();
    }, 5000);
  }

  // 注册全局快捷键
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (mainWindow) {
      isAlwaysOnTop = !isAlwaysOnTop;
      mainWindow.setAlwaysOnTop(isAlwaysOnTop);
      mainWindow.setVisibleOnAllWorkspaces(isAlwaysOnTop);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(err => {
  console.error('应用启动错误:', err);
  log.error('应用启动错误:', err);
  
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.webContents.send('loading-status', `启动错误: ${err.message}`);
    setTimeout(() => loadingWindow.close(), 5000);
  }
});

app.on('will-quit', () => {
  log.info('应用即将退出，开始清理资源...');
  globalShortcut.unregisterAll();
  cleanupProcesses();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupProcesses();
    app.quit();
  }
});

app.on('before-quit', () => {
  log.info('应用退出前，确保清理所有进程');
  cleanupProcesses();
});