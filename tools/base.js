// tools/base.js
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 执行终端命令（接收对象参数）
function runCommand({ command }) {
    return new Promise((resolve) => {
        exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) resolve(`错误: ${error.message}`);
            else if (stderr) resolve(`stderr: ${stderr}`);
            else resolve(stdout);
        });
    });
}

// 以管理员权限执行命令（接收对象参数）
function runAdminCommand({ command }) {
    return new Promise((resolve) => {
        const script = `do shell script "${command.replace(/"/g, '\\"')}" with administrator privileges`;
        const cmd = `osascript -e '${script}'`;
        require('child_process').exec(cmd, (error, stdout, stderr) => {
            if (error) resolve(`管理员命令执行失败: ${error.message}`);
            else resolve(stdout || "命令执行成功");
        });
    });
}

// 搜索应用（支持中英文关键词，接收对象参数）
function findApps({ chineseKeyword = '', englishKeyword = '' }) {
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

// 删除应用（弹出授权对话框，接收对象参数）
function deleteApp({ appPath }) {
    return new Promise((resolve) => {
        const script = `do shell script \"rm -rf '${appPath}'\" with administrator privileges`;
        const cmd = `osascript -e '${script}'`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) resolve(`删除失败: ${error.message}`);
            else resolve(`已删除: ${appPath}`);
        });
    });
}

// 读取文件（接收对象参数）
function readFile({ filePath }) {
    try { return fs.readFileSync(filePath, 'utf8'); } catch (e) { return `读文件出错: ${e.message}`; }
}

// 写入文件（接收对象参数）
function writeFile({ filePath, content }) {
    try { fs.writeFileSync(filePath, content, 'utf8'); return '写入成功'; } catch (e) { return `写文件出错: ${e.message}`; }
}

// 解压（接收对象参数）
function unzip({ zipPath, destDir }) {
    return new Promise((resolve, reject) => {
        const command = `unzip -o "${zipPath}" -d "${destDir}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });
}

// 打开网页（接收对象参数）
function openUrl({ url }) {
    return new Promise((resolve, reject) => {
        exec(`open "${url}"`, (error, stdout, stderr) => {
            if (error) reject(`打开失败: ${error.message}`);
            else resolve(`成功打开: ${url}`);
        });
    });
}

module.exports = {
    runCommand: {
        description: '执行终端命令，参数：command（字符串，要执行的完整命令，如 "ls -l"）',
        params: ['command'],
        fun: runCommand
    },
    readFile: {
        description: '读取文件内容，参数：filePath（文件路径）',
        params: ['filePath'],
        fun: readFile
    },
    writeFile: {
        description: '写入文件内容，参数：filePath（文件路径），content（内容字符串）',
        params: ['filePath', 'content'],
        fun: writeFile
    },
    findApps: {
        description: '按名称关键词搜索已安装的应用，需同时提供中文和英文名称进行匹配，中英文参数为空串则返回所有应用，参数：chineseKeyword（中文关键词），englishKeyword（英文关键词）',
        params: ['chineseKeyword', 'englishKeyword'],
        fun: findApps
    },
    deleteApp: {
        description: '删除指定路径的应用，参数：appPath（完整应用路径）',
        params: ['appPath'],
        fun: deleteApp
    },
    unzip: {
        description: '解压工具，参数：zipPath（ZIP文件的路径），destDir（目标目录路径）',
        params: ['zipPath', 'destDir'],
        fun: unzip
    },
    openUrl: {
        description: '执行 open 命令（如打开网页），参数：url（URL）',
        params: ['url'],
        fun: openUrl
    },
    runAdminCommand: {
        description: '以管理员权限执行命令，任何需要管理员权限的操作可以先调用该工具获取权限，参数：command（要执行的命令字符串）',
        params: ['command'],
        fun: runAdminCommand
    }
};