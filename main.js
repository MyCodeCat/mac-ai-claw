// main.js - 增强版AI智能体，支持工具动态加载、热重载、严格格式
const https = require('https');
const os = require('os');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// --- 配置 ---
const { ds, qw, config } = require('./config.json');
const model = qw;
const API_KEY = model.API_KEY;
const API_URL = model.API_URL;
const MODEL = model.MODEL; // 模型名称数组

for (let key in config) {
    process.env[key] = config[key]
}

// --- 基础工具（内置）---
const baseTools = require('./tools/base.js');
const builtinTools = {...baseTools };

// 后续会动态添加 reloadTools，先占位
let tools = {...builtinTools };
let toolMeta = {};

// 动态加载 tools 目录下所有 .js 文件（合并到 tools 中）
function loadTools() {
    const toolsDir = path.join(__dirname, 'tools');
    const externalTools = {};

    // 确保目录存在
    if (!fs.existsSync(toolsDir)) {
        fs.mkdirSync(toolsDir, { recursive: true });
    }

    // 读取所有 .js 文件
    const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
        const filePath = path.join(toolsDir, file);
        try {
            // 清除缓存，确保重新加载最新内容
            delete require.cache[require.resolve(filePath)];
            const moduleExports = require(filePath);
            Object.assign(externalTools, moduleExports);
        } catch (err) {
            console.error(`加载工具文件 ${file} 失败:`, err.message);
        }
    }

    // 合并：外部工具优先（可覆盖内置同名工具，但内置 reloadTools 会最后确保存在）
    tools = {...builtinTools, ...externalTools };

    // 确保 reloadTools 始终可用（如果被覆盖，重新添加）
    if (!tools.reloadTools) {
        tools.reloadTools = {
            fun: async() => {
                loadTools();
                return "工具重载成功";
            },
            description: "重新扫描并加载 tools 目录下的所有工具",
            params: []
        };
    }

    // 更新 toolMeta
    toolMeta = Object.fromEntries(
        Object.entries(tools).map(([name, { fun, description, params }]) => [
            name,
            { description, params: params || [], fun }
        ])
    );

    console.log(`已加载 ${Object.keys(tools).length} 个工具`);
}

// 初次加载
loadTools();

// 将 loadTools 挂载到全局，以便 reloadTools 内部调用
global.loadTools = loadTools;

// --- 系统信息 ---
const systemInfo = {
    系统: `${os.type()} ${os.release()}`,
    用户名: os.userInfo().username,
    homedir: os.homedir(),
    cwd: process.cwd(),
    hostname: os.hostname(),
};

// --- 增强的系统提示（包含工具编写指南）---
const SYSTEM_PROMPT = `你是一个能调用工具的助手。当前操作系统环境（JSON格式）是 ${JSON.stringify(systemInfo)}。
可用工具（JSON格式）:${JSON.stringify(tools, (key, val) => typeof val === 'function' ? 'function' : val, 2)}。

重要规则：
1. 如果决定调用工具，必须严格输出一个纯 JSON 格式：{"tool": "工具名", "args": [参数列表]}
   - 禁止包含任何其他文字、解释或代码块。
   - 参数必须按工具定义顺序提供，禁止使用单引号。
   - **如果参数是字符串且内部包含英文双引号，必须使用反斜杠转义，否则JSON解析会失败。**
2. 如果非工具调用对话，则直接用自然语言回复。
3. 请不要虚构没有的工具。
4. 一次调用只输出一个 JSON（如需多工具，AI会自动分步调用，不需要一次输出多个）。
5. 如果工具执行失败（返回错误信息），任务立即终止，你必须用自然语言向用户解释失败原因，不得再尝试调用任何其他工具。
6. 如果用户询问“为什么失败”或类似问题，请回顾历史中的工具执行结果，直接用自然语言解释失败原因，不要再调用任何工具。
7. 每个工具都有固定的参数个数和顺序，必须严格按照工具定义提供参数，否则工具会调用失败。
8. **当工具执行成功后，如果你判断任务已完成，你必须基于工具返回的最新结果（例如时间、IP地址等）来生成自然语言回复，不得虚构或编造任何数据。你可以直接引用工具返回的字段。**
9. **工具执行的结果会以 system 消息的形式出现在对话历史中，你可以直接使用其中的数据。**
10. **工具编写规则（重要！）**：
    - **环境限制**：当前运行环境是**原生 Node.js**，**仅支持内置模块**（如 \`fs\`、\`path\`、\`http\`、\`https\`、\`child_process\` 等）。**禁止使用 \`fetch\` API**（浏览器环境特有），也**禁止使用任何需要 \`npm install\` 安装的第三方模块**（如 \`axios\`、\`node-fetch\`）。编写工具代码时，必须使用 Node.js 内置模块。
    - 如果用户要求你“写一个工具”或“添加功能”，你必须使用 \`writeFile\` 工具将代码写入当前目录的下的tools文件夹里，文件名必须以 \`.js\` 结尾。
    - 每个工具文件应导出一个对象，对象的每个属性就是一个工具。例如：
      \`\`\`javascript
      module.exports = {
        toolName: {
          fun: async (参数) => {
            return 返回结果;
          },
          description: "函数功能解释，参数解释",
          params: ["参数"]
        }
      };
      \`\`\`
    - **文件写入成功后，你必须立即调用 \`reloadTools\` 工具使新工具生效**，否则新工具不会被加载，后续调用仍会使用旧版本。
    示例（工具编写流程）：
        用户：帮我写一个某功能的工具。
        AI：{"tool": "writeFile", "args": [工具代码] } };"]}
        （工具返回写入成功）
        AI：{"tool": "reloadTools", "args": []}
        （工具返回重载成功）
        AI：工具已添加，让我试一下：{"tool": "新工具名称", "args": ["参数"]}
        （工具返回数据）
        AI: 输出工具结果
11. **AppleScript 脚本编写规则**：
    - 放到 tools 目录下，文件名必须以 \`.js\` 结尾。
    - **AppleScript 必须使用 System Events 进行 GUI 自动化**，因为大多数普通应用（如计算器）不支持直接的 AppleScript 命令。
    - AppleScript 用例：
    \`\`\`javascript
    module.exports = {
        AppleScriptName: {
        fun: async (参数) => {
            // 可以在函数内直接执行 osascript
              const { exec } = require('child_process');
              const script = \`tell application "System Events" to get name of every process\`;
              return new Promise((resolve, reject) => {
                exec(\`osascript -e '\${script}'\`, (error, stdout, stderr) => {
                  if (error) reject(error);
                  else resolve(stdout.trim());
                });
              });
            },
            description: "函数功能解释，参数解释",
            params: ["参数"]
          }
        };
        \`\`\`
    - 编写 AppleScript 时，必须遵循以下格式：
        \`\`\`applescript
        tell application "目标应用" to activate
        tell application "System Events"
            tell process "目标应用"
                -- 使用 keystroke, click, key code 等模拟用户操作
                keystroke "按键内容"   -- 如 "5", "+"
                keystroke "c" using {command down}   -- 快捷键
                click button "按钮名称" of window 1   -- 点击按钮
            end tell
        end tell
        \`\`\`
`;

// --- 状态管理 ---
let apiCount = 0;
let modelIndex = 0;
const MAX_TOOL_CALLS = 5;
const MAX_HISTORY_ROUNDS = 3;

// --- 调用AI API（带重试和模型切换）---
async function askAI(messages, temperature = 0) {
    const data = JSON.stringify({
        model: MODEL[modelIndex],
        messages,
        temperature,
        enable_thinking: false
    });

    const options = {
        hostname: API_URL,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Length': Buffer.byteLength(data, 'utf8')
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 429) {
                    console.log(MODEL[modelIndex], '调用失败 (429)，尝试切换模型...');
                    modelIndex++;
                    if (modelIndex < MODEL.length) {
                        setTimeout(() => {
                            askAI(messages, temperature).then(resolve).catch(reject);
                        }, 1000);
                    } else {
                        reject('所有模型均返回429，请稍后重试');
                    }
                    return;
                }
                if (res.statusCode >= 400) {
                    reject(`HTTP ${res.statusCode}: ${body}`);
                    return;
                }
                try {
                    const json = JSON.parse(body);
                    if (json.choices && json.choices.length > 0) {
                        resolve(json.choices[0].message.content);
                    } else {
                        reject('API返回格式异常: ' + body);
                    }
                } catch (e) {
                    reject('解析API响应失败: ' + e.message);
                }
            });
        });
        req.on('error', (e) => reject('请求失败: ' + e.message));
        req.write(data);
        req.end();
        apiCount++;
    });
}

// --- 工具参数验证 ---
function validateToolArgs(toolName, args) {
    const meta = toolMeta[toolName];
    if (!meta) return { valid: false, reason: `工具 "${toolName}" 不存在` };
    if (!Array.isArray(args)) return { valid: false, reason: `参数必须是数组` };
    if (meta.params.length !== args.length) {
        return {
            valid: false,
            reason: `参数数量错误：工具 ${toolName} 需要 ${meta.params.length} 个参数 (${meta.params.join(', ')})，但收到了 ${args.length} 个参数`
        };
    }
    return { valid: true };
}

// --- 执行单个工具 ---
async function executeSingleTool(cmd, toolCallSet) {
    const { tool, args } = cmd;
    if (!tool || !toolMeta[tool]) {
        const errorMsg = `错误：未知工具 "${tool}"`;
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }

    const validation = validateToolArgs(tool, args);
    if (!validation.valid) {
        const errorMsg = `工具 ${tool} 参数验证失败：${validation.reason}`;
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }

    const argKey = JSON.stringify(args);
    if (!toolCallSet[tool]) {
        toolCallSet[tool] = new Set();
    }
    if (toolCallSet[tool].has(argKey)) {
        const errorMsg = `异常：多次调用同一工具 ${tool} 相同参数`;
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }
    toolCallSet[tool].add(argKey);

    console.log(`→ 调用工具: ${tool}`, args);
    try {
        const result = await toolMeta[tool].fun(...(args || []));
        let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        if (resultStr.length > 300) resultStr = resultStr.substring(0, 300) + '...';
        console.log(`执行工具结果：${resultStr}`);
        return { success: true, result };
    } catch (e) {
        const errorMsg = `工具 ${tool} 执行异常: ${e.message}`;
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }
}

// --- 主处理函数 ---
async function processUserInput(userInput, history) {
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...buildHistoryMessages(history, MAX_HISTORY_ROUNDS),
        { role: 'user', content: userInput }
    ];

    let toolCallCount = 0;
    const toolCallSet = {};

    let aiResponse = await askAI(messages);
    let { text, json } = extractJsonAndText(aiResponse);
    let finalText = text;

    while (json.length > 0 && toolCallCount < MAX_TOOL_CALLS) {
        for (const cmd of json) {
            toolCallCount++;
            const result = await executeSingleTool(cmd, toolCallSet);

            if (result.success) {
                messages.push({
                    role: 'system',
                    content: `工具 ${cmd.tool} 执行结果：${JSON.stringify(result.result)}`
                });
            } else {
                finalText += `\n[工具执行失败] ${result.error}`;
                history.push({ role: 'assistant', content: finalText });
                return finalText;
            }
        }

        if (toolCallCount >= MAX_TOOL_CALLS) {
            finalText += '\n[提示] 工具调用次数已达上限，请简化任务。';
            break;
        }

        const followPrompt = {
            role: 'user',
            content: `基于以上工具执行结果，任务是否已完成？如果已完成，请用自然语言回复用户（必须基于工具返回的真实数据）；如果还需要调用其他工具，请输出一个工具调用 JSON（{"tool":"...","args":[...]}）。注意：最多还能调用 ${MAX_TOOL_CALLS - toolCallCount} 次工具。`
        };
        messages.push({ role: 'assistant', content: aiResponse });
        messages.push(followPrompt);

        aiResponse = await askAI(messages);
        const next = extractJsonAndText(aiResponse);
        text = next.text;
        json = next.json;

        if (text) finalText += '\n' + text;
    }

    if (json.length > 0 && toolCallCount >= MAX_TOOL_CALLS) {
        finalText += '\n[警告] 工具调用次数已达上限，剩余工具请求已被忽略。';
    }

    history.push({ role: 'assistant', content: finalText });
    return finalText;
}

function buildHistoryMessages(history, rounds) {
    const recent = history.slice(-rounds * 2);
    return recent.map(msg => ({ role: msg.role, content: msg.content }));
}

// --- 解析混合响应 ---
function extractJsonAndText(input) {
    let text = '';
    const json = [];
    let i = 0;
    const length = input.length;

    while (i < length) {
        if (input[i] === '{') {
            let j = i + 1;
            let braceCount = 1;
            while (j < length && braceCount > 0) {
                if (input[j] === '{') braceCount++;
                else if (input[j] === '}') braceCount--;
                j++;
            }
            if (braceCount === 0) {
                const candidate = input.slice(i, j);
                try {
                    const obj = JSON.parse(candidate);
                    if (obj && typeof obj === 'object' && obj.tool) {
                        json.push(obj);
                        i = j;
                        continue;
                    }
                } catch {}
            }
        } else if (input[i] === '[') {
            let j = i + 1;
            let bracketCount = 1;
            while (j < length && bracketCount > 0) {
                if (input[j] === '[') bracketCount++;
                else if (input[j] === ']') bracketCount--;
                j++;
            }
            if (bracketCount === 0) {
                const candidate = input.slice(i, j);
                try {
                    const arr = JSON.parse(candidate);
                    if (Array.isArray(arr)) {
                        json.push(arr);
                        i = j;
                        continue;
                    }
                } catch {}
            }
        }
        text += input[i];
        i++;
    }
    return { text: text.trim(), json };
}

// --- 主交互循环 ---
console.log('欢迎使用 mac ai');
const history = [];

function promptLoop() {
    rl.question('>>> ', async(input) => {
        if (input.trim() === '/new') {
            console.clear();
            console.log('开始新会话');
            history.length = 0;
            promptLoop();
            return;
        }
        if (input.trim() === '/exit') {
            console.log('再见！');
            rl.close();
            return;
        }

        try {
            const finalReply = await processUserInput(input, history);
            console.log(finalReply);
        } catch (e) {
            console.log('出错:', e);
            history.push({ role: 'assistant', content: `系统错误: ${e}` });
        }
        console.log(`→ 已调用API ${apiCount} 次`);
        promptLoop();
    });
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

promptLoop();