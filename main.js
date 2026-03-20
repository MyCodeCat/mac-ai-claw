// simple_ai.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { getMcpTools, callTool } = require('./mcp');

// ---------- 1. 读取配置 ----------
const { ds, qw, config } = require('./config.json');
const model = qw;
const API_KEY = model.API_KEY;
const API_URL = model.API_URL;
const MODEL = model.MODEL[3];

for (let key in config) {
    process.env[key] = config[key]
}

// ---------- 3. 整合 MCP 工具（启动时动态获取） ----------
let allTools = {};
// 从本地 tools 文件获取工具列表
function initLocalTools() {
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
    allTools = {...externalTools }
}

// 从 MCP 服务器获取工具列表并转换为统一格式
async function initMcpTools() {
    initLocalTools()
    const toolsStr = await getMcpTools(); // 返回 JSON 字符串
    const mcpToolList = JSON.parse(toolsStr); // 预期为 [{ name, description, inputSchema }, ...]
    for (const tool of mcpToolList) {
        // 为每个 MCP 工具创建一个包装函数
        allTools[tool.name] = {
            description: tool.description,
            params: tool.inputSchema.properties,
            fun: async(args) => {
                const result = await callTool(tool.name, args);
                return typeof result === 'string' ? result : JSON.stringify(result);
            }
        };
    }
    // console.log(Object.keys(allTools));
}

// ---------- 4. AI 请求 ----------
async function askAI(messages) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const payload = {
        model: MODEL,
        messages,
        temperature: 0.1,
        enable_thinking: false
    };
    const postData = JSON.stringify(payload);
    const url = new URL(`https://${API_URL}/v1/chat/completions`);

    const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) reject(new Error(json.error.message));
                    else resolve(json.choices[0].message.content);
                } catch (e) {
                    reject(new Error(`解析响应失败: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// ---------- 5. 工具执行（统一使用对象参数） ----------
async function executeTool(toolName, args) {
    const tool = allTools[toolName];
    if (!tool) throw new Error(`未知工具: ${toolName}`);
    try {
        console.log(`开始调用工具：${toolName}, 参数：${JSON.stringify(args)}`);
        return await tool.fun(args);
    } catch (e) {
        return `工具执行错误: ${e.message}`;
    }
}

// ---------- 6. 历史记录管理 ----------
const HISTORY_FILE = path.join(__dirname, 'history.json');

function loadHistory() {
    try {
        const data = fs.readFileSync(HISTORY_FILE, 'utf8');
        return JSON.parse(data);
        return [];
    } catch {
        return []; // 文件不存在或损坏，返回空数组
    }
}

function saveHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

// ---------- 7. 辅助函数：尝试修复常见 JSON 格式错误 ----------
function tryParseJson(str) {
    // 1. 直接尝试
    try {
        return JSON.parse(str);
    } catch (e) {
        // 2. 将未转义的控制字符转义（换行、回车、制表符）
        let fixed = str.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
        try {
            return JSON.parse(fixed);
        } catch (e2) {
            // 3. 移除 JavaScript 风格的注释（仅支持 // 和 /* */ 简单情况）
            // 注意：这个处理可能破坏字符串中的内容，但通常 AI 不会在字符串中故意包含注释语法
            let withoutComments = str.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            try {
                return JSON.parse(withoutComments);
            } catch (e3) {
                return null;
            }
        }
    }
}

function extractToolJson(response) {
    // 1. 尝试匹配 ```json ... ``` 代码块
    let codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        const parsed = tryParseJson(codeBlockMatch[1].trim());
        if (parsed) return parsed;
    }
    // 2. 尝试匹配第一个 { 到最后一个 } 之间的内容
    let jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        const parsed = tryParseJson(jsonMatch[0]);
        if (parsed) return parsed;
    }
    return null;
}

// ---------- 8. 主处理函数 ----------
function getSystemPrompt() {
    return `你是一个可以调用工具的助手。
可用工具（JSON格式）：${JSON.stringify(allTools)}
重要规则：
- 如果需要调用工具，必须严格输出一个纯 JSON 对象：{"tool": "工具名", "args": {"参数名1": 值1, "参数名2": 值2, ...}}
- 参数值如果包含换行符、引号、反斜杠等特殊字符，请在字符串内部正确转义（例如用 \\n 表示换行）。
- 输出时不要添加任何其他文本、注释或代码块，只输出 JSON。
- args 必须是一个对象，键名与工具定义中的参数名完全一致。
- 如果不需要调用工具，直接输出自然语言回复。
- 一次只输出一个 JSON（如需多个工具，系统会自动多次调用）。
- 工具执行结果会作为系统消息返回给你。
`;
}

async function processUserInput(userInput, history) {
    // 构建消息列表
    const messages = [
        { role: 'system', content: getSystemPrompt() },
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: userInput }
    ];

    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 10;
    let lastReply = userInput; // 占位

    while (toolCallCount < MAX_TOOL_CALLS) {
        const aiResponse = await askAI(messages);
        // 尝试提取工具调用 JSON
        const toolCall = extractToolJson(aiResponse);

        if (toolCall && toolCall.tool) {
            // 调用工具
            toolCallCount++;
            const args = toolCall.args || {};
            const result = await executeTool(toolCall.tool, args);
            // 将工具结果作为系统消息加入对话
            messages.push({ role: 'assistant', content: aiResponse });
            messages.push({ role: 'system', content: `工具 ${toolCall.tool} 执行结果: ${result}` });
            // console.log(`工具 ${toolCall.tool} 执行结果: ${result}`);
            lastReply = result;
        } else {
            // 无工具调用，返回自然语言
            lastReply = aiResponse;
            break;
        }
    }

    // 保存历史（用户输入 + AI 最终回复）
    history.push({ role: 'user', content: userInput });
    history.push({ role: 'assistant', content: lastReply });
    saveHistory(history);
    return lastReply;
}

// ---------- 9. 启动交互 ----------
async function main() {
    await initMcpTools(); // 获取 MCP 工具并合并到 allTools
    const history = loadHistory();
    console.log('已加载历史记录，共', history.length, '条消息');

    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = () => {
        rl.question('\n>>> ', async(input) => {
            if (input.trim() === '/new') {
                console.clear();
                console.log('开始新会话');
                saveHistory([])
                ask();
                return;
            }
            try {
                const reply = await processUserInput(input, history);
                console.log('\n' + reply);
            } catch (err) {
                console.error('错误:', err.message);
            }
            ask();
        });
    };
    ask();
}

main().catch(console.error);