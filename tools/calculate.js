module.exports = {
    calculate: {
        fun: async({ value }) => {
            const { exec } = require('child_process');

            // 逆波兰转换（调度场算法）
            function infixToRPN(expr) {
                expr = expr.replace(/\s+/g, '');
                const tokens = [];
                let i = 0;
                const len = expr.length;
                const ops = { '+': 1, '-': 1, '*': 2, '/': 2 };

                // 词法分析：提取数字和运算符
                while (i < len) {
                    const ch = expr[i];
                    if (/\d/.test(ch) || ch === '.') {
                        let j = i;
                        while (j < len && (/\d/.test(expr[j]) || expr[j] === '.')) j++;
                        tokens.push(expr.substring(i, j));
                        i = j;
                    } else if ('+-*/()'.includes(ch)) {
                        tokens.push(ch);
                        i++;
                    } else {
                        i++; // 忽略非法字符
                    }
                }

                const output = [];
                const stack = [];

                for (const token of tokens) {
                    if (!isNaN(parseFloat(token)) || token === '.') {
                        output.push(token);
                    } else if (token === '(') {
                        stack.push(token);
                    } else if (token === ')') {
                        while (stack.length && stack[stack.length - 1] !== '(') {
                            output.push(stack.pop());
                        }
                        stack.pop(); // 移除 '('
                    } else {
                        while (
                            stack.length &&
                            stack[stack.length - 1] !== '(' &&
                            ops[stack[stack.length - 1]] >= ops[token]
                        ) {
                            output.push(stack.pop());
                        }
                        stack.push(token);
                    }
                }

                while (stack.length) {
                    output.push(stack.pop());
                }
                return output;
            }

            // 根据逆波兰表达式生成按键命令数组
            function generateKeyCommands(rpnTokens) {
                const commands = [];
                for (let i = 0; i < rpnTokens.length; i++) {
                    const token = rpnTokens[i];
                    // 数字（含小数点）
                    if (!isNaN(parseFloat(token)) || token.includes('.')) {
                        for (const ch of token) {
                            commands.push(`keystroke "${ch}"`);
                        }
                        // 若下一个 token 也是数字，则按 Return 将其压入堆栈
                        if (i < rpnTokens.length - 1 && !isNaN(parseFloat(rpnTokens[i + 1]))) {
                            commands.push(`keystroke return`);
                        }
                    } else {
                        // 运算符
                        commands.push(`keystroke "${token}"`);
                    }
                }
                return commands;
            }

            try {
                // 转换为逆波兰表达式
                const rpn = infixToRPN(value);
                // 生成按键命令
                const keyCommands = generateKeyCommands(rpn);

                // 构建 AppleScript
                const script = `tell application "Calculator" to activate
tell application "System Events"
tell process "Calculator"
  ${keyCommands.join('\n    ')}
end tell
end tell`;

                // 执行脚本
                return new Promise((resolve, reject) => {
                    exec(`osascript -e '${script}'`, (error, stdout, stderr) => {
                        if (error) reject(error);
                        else resolve(stdout.trim());
                    });
                });
            } catch (err) {
                return Promise.reject(err);
            }
        },
        description: "调用系统计算器应用并对其进行操作，参数：算法式子（如1+2）",
        params: ['value']
    }
};