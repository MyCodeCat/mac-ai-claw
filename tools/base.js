// tools/base.js
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 执行终端命令（只接受一个字符串参数）
function runCommand(command) {
    return new Promise((resolve) => {
        exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) resolve(`错误: ${error.message}`);
            else if (stderr) resolve(`stderr: ${stderr}`);
            else resolve(stdout);
        });
    });
}
// 以管理员权限执行命令
function runAdminCommand(command) {
    return new Promise((resolve) => {
        const script = `do shell script "${command.replace(/"/g, '\\"')}" with administrator privileges`;
        const cmd = `osascript -e '${script}'`;
        require('child_process').exec(cmd, (error, stdout, stderr) => {
            if (error) resolve(`管理员命令执行失败: ${error.message}`);
            else resolve(stdout || "命令执行成功");
        });
    });
}

// 获取局域网 IPv4 地址
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

// 搜索应用（支持中英文关键词）
function findApps(chineseKeyword = '', englishKeyword = '') {
    console.log(`搜索应用：中文关键词="${chineseKeyword}"，英文关键词="${englishKeyword}"`);

    const searchPaths = [
        '/Applications',
        path.join(os.homedir(), 'Applications')
    ].filter(p => fs.existsSync(p));

    const processedChinese = chineseKeyword.replace(/\s+/g, '').toLowerCase();
    const processedEnglish = englishKeyword.replace(/\s+/g, '').toLowerCase();

    let results = [];
    for (const dir of searchPaths) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (item.endsWith('.app')) {
                const appName = item.slice(0, -4);
                const processedAppName = appName.replace(/\s+/g, '').toLowerCase();

                if (processedChinese === '' && processedEnglish === '') {
                    results.push({ name: appName, path: path.join(dir, item) });
                } else {
                    if ((processedChinese && processedAppName.includes(processedChinese)) ||
                        (processedEnglish && processedAppName.includes(processedEnglish))) {
                        results.push({ name: appName, path: path.join(dir, item) });
                    }
                }
            }
        }
    }
    return JSON.stringify(results, null, 2);
}

// 删除应用（弹出授权对话框）
function deleteApp(appPath) {
    return new Promise((resolve) => {
        const script = `do shell script \"rm -rf '${appPath}'\" with administrator privileges`;
        const cmd = `osascript -e '${script}'`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) resolve(`删除失败: ${error.message}`);
            else resolve(`已删除: ${appPath}`);
        });
    });
}

function readFile(filePath) {
    try { return fs.readFileSync(filePath, 'utf8'); } catch (e) { return `读文件出错: ${e.message}`; }
}

function writeFile(filePath, content) {
    try { fs.writeFileSync(filePath, content, 'utf8'); return '写入成功'; } catch (e) { return `写文件出错: ${e.message}`; }
}

// 时间日期工具
function getCurrentTime() {
    const now = new Date();
    return {
        iso: now.toISOString(),
        local: now.toLocaleString(),
        timestamp: now.getTime(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds()
    };
}

// 解压
function unzip(zipPath, destDir) {
    return new Promise((resolve, reject) => {
        const command = `unzip -o "${zipPath}" -d "${destDir}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });
}

// 打开网页
function openUrl(url) {
    return new Promise((resolve, reject) => {
        exec(`open "${url}"`, (error, stdout, stderr) => {
            if (error) reject(`打开失败: ${error.message}`);
            else resolve(`成功打开: ${url}`);
        });
    });
}

module.exports = {
    runCommand: {
        description: '执行终端命令，参数：一个字符串，即要执行的完整命令（如 "ls -l"）',
        params: ['command'],
        fun: runCommand
    },
    readFile: {
        description: '读取文件内容，参数：文件路径',
        params: ['filePath'],
        fun: readFile
    },
    writeFile: {
        description: '写入文件内容，参数：文件路径，内容字符串',
        params: ['filePath', 'content'],
        fun: writeFile
    },
    getLocalIP: {
        description: '获取本机IP地址，无需参数',
        params: [],
        fun: getLocalIP
    },
    findApps: {
        description: '按名称关键词搜索已安装的应用，需同时提供中文和英文名称进行匹配，中英文参数为空串则返回所有应用，参数：中文关键词，英文关键词',
        params: ['chineseKeyword', 'englishKeyword'],
        fun: findApps
    },
    deleteApp: {
        description: '删除指定路径的应用，参数：完整应用路径',
        params: ['appPath'],
        fun: deleteApp
    },
    getCurrentTime: {
        description: '获取当前时间信息，无需参数',
        params: [],
        fun: getCurrentTime
    },
    unzip: {
        description: '解压工具，参数：ZIP文件的路径，目标目录路径',
        params: ['zipPath', 'destDir'],
        fun: unzip
    },
    openUrl: {
        description: '执行 open 命令（如打开网页），参数：URL',
        params: ['url'],
        fun: openUrl
    },
    runAdminCommand: {
        description: '以管理员权限执行命令（会弹出授权对话框），参数：要执行的命令字符串',
        params: ['command'],
        fun: runAdminCommand
    }
};