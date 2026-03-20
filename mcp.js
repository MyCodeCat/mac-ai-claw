const https = require('https');
const { URL } = require('url');
const { mcps } = require('./config.json');

// 为每个 URL 独立存储 sessionId
const sessionMap = new Map();
// 工具名 -> 服务器 URL 映射
const toolToUrlMap = new Map();

function parseSSE(sseData) {
    const lines = sseData.split('\n');
    const events = [];
    let currentEvent = null;
    for (const line of lines) {
        if (line.startsWith('data:')) {
            const dataStr = line.substring(5).trim();
            if (dataStr) {
                try {
                    const data = JSON.parse(dataStr);
                    if (!currentEvent) {
                        currentEvent = { data };
                    } else {
                        events.push(currentEvent);
                        currentEvent = { data };
                    }
                } catch (e) {
                    // 忽略解析失败的行
                }
            }
        } else if (line.trim() === '' && currentEvent) {
            events.push(currentEvent);
            currentEvent = null;
        }
    }
    if (currentEvent) {
        events.push(currentEvent);
    }
    return events;
}

// 发送 JSON-RPC 请求（有 id，期望响应）
async function sendRequest(url, method, params = {}, useSession = false) {
    const payload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params: params || {}
    };

    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(payload);
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Content-Length': Buffer.byteLength(postData)
        };
        if (useSession) {
            const sessionId = sessionMap.get(url);
            if (sessionId) {
                headers['mcp-session-id'] = sessionId;
            }
        }

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers
        };

        const req = https.request(options, (res) => {
            const newSessionId = res.headers['mcp-session-id'];
            if (newSessionId) {
                sessionMap.set(url, newSessionId);
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    let errorMsg = `HTTP ${res.statusCode}`;
                    try {
                        const errorJson = JSON.parse(data);
                        errorMsg = errorJson.Message || errorJson.message || errorMsg;
                    } catch (e) {}
                    reject(new Error(`Request failed: ${errorMsg}`));
                    return;
                }

                try {
                    const contentType = res.headers['content-type'] || '';
                    let result;

                    if (contentType.includes('application/json')) {
                        const response = JSON.parse(data);
                        if (response.error) {
                            const errMsg = typeof response.error === 'string' ?
                                response.error :
                                (response.error.message || 'Unknown error');
                            reject(new Error(`JSON-RPC error: ${errMsg}`));
                        } else {
                            result = response.result;
                        }
                    } else if (contentType.includes('text/event-stream')) {
                        const events = parseSSE(data);
                        if (events.length === 0) {
                            reject(new Error('No events in SSE stream'));
                        } else {
                            let rpcResponse = null;
                            for (const event of events) {
                                if (event.data && event.data.jsonrpc) {
                                    rpcResponse = event.data;
                                    break;
                                }
                            }
                            if (!rpcResponse && events[0] && events[0].data) {
                                rpcResponse = events[0].data;
                            }
                            if (rpcResponse) {
                                if (rpcResponse.error) {
                                    const errMsg = typeof rpcResponse.error === 'string' ?
                                        rpcResponse.error :
                                        (rpcResponse.error.message || 'Unknown error');
                                    reject(new Error(`JSON-RPC error: ${errMsg}`));
                                } else {
                                    result = rpcResponse.result;
                                }
                            } else {
                                reject(new Error('No valid JSON-RPC response in SSE'));
                            }
                        }
                    } else {
                        reject(new Error(`Unsupported content-type: ${contentType}`));
                    }

                    resolve(result);
                } catch (err) {
                    reject(new Error(`Response parsing error: ${err.message}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 发送 JSON-RPC 通知（无 id，不期望响应）
async function sendNotification(url, method, params = {}) {
    const payload = {
        jsonrpc: '2.0',
        method,
        params: params || {}
    };

    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(payload);
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Content-Length': Buffer.byteLength(postData)
        };
        const sessionId = sessionMap.get(url);
        if (sessionId) {
            headers['mcp-session-id'] = sessionId;
        }

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers
        };

        const req = https.request(options, (res) => {
            const newSessionId = res.headers['mcp-session-id'];
            if (newSessionId) {
                sessionMap.set(url, newSessionId);
            }
            res.resume();
            res.on('end', () => resolve());
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 初始化 MCP 会话
async function initialize(urls = []) {
    const tasks = urls.map(async(url) => {
        try {
            await sendRequest(url, 'initialize', {
                protocolVersion: '0.1.0',
                clientInfo: { name: 'mcp-node-client', version: '1.0.0' },
                capabilities: {}
            }, false);
            await sendNotification(url, 'notifications/initialized', {});
        } catch (err) {
            console.error(`Failed to initialize ${url}:`, err.message);
            throw err;
        }
    });
    await Promise.allSettled(tasks);
}

// 列出所有可用工具，并建立工具名到 URL 的映射
async function listTools(urls = []) {
    const tasks = urls.map(async(url) => {
        try {
            const result = await sendRequest(url, 'tools/list', {}, true);
            if (result && Array.isArray(result.tools)) {
                // 记录每个工具属于哪个 URL
                for (const tool of result.tools) {
                    toolToUrlMap.set(tool.name, url);
                }
                return { success: true, tools: result.tools };
            } else {
                console.warn(`Invalid response from ${url}:`, result);
                return { success: false, error: 'Invalid response structure' };
            }
        } catch (err) {
            console.error(`Error fetching tools from ${url}:`, err.message);
            return { success: false, error: err.message };
        }
    });
    const results = await Promise.allSettled(tasks);
    const allTools = [];
    for (const item of results) {
        if (item.status === 'fulfilled' && item.value.success) {
            allTools.push(...item.value.tools);
        }
    }
    return allTools;
}

// 调用指定工具（根据映射找到正确的服务器 URL）
async function callTool(toolName, args) {
    const url = toolToUrlMap.get(toolName);
    if (!url) {
        throw new Error(`No MCP server found for tool: ${toolName}`);
    }
    const result = await sendRequest(url, 'tools/call', {
        name: toolName,
        arguments: args
    }, true);

    // 处理返回内容，保持与原有格式兼容
    if (result && result.content) {
        if (Array.isArray(result.content)) {
            // 提取文本内容
            const texts = result.content
                .filter(item => item.type === 'text')
                .map(item => item.text);
            return texts.join('\n');
        } else if (typeof result.content === 'string') {
            return result.content;
        }
    }
    return JSON.stringify(result);
}

async function getMcpTools() {
    const mcpUrls = Object.keys(mcps).map(res => mcps[res].url);
    // 初始化所有服务器
    await initialize(mcpUrls);
    // 获取所有工具列表并建立映射
    const tools = await listTools(mcpUrls);
    return JSON.stringify(tools);
}

// 如果直接运行此文件，仅输出工具列表（用于测试）
if (require.main === module) {
    getMcpTools().then(console.log).catch(console.error);
}

module.exports = { getMcpTools, callTool };