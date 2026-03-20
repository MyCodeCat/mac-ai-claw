module.exports = {
    openNotes: {
        fun: async({ noteTitle }) => {
            const { exec } = require('child_process');
            // 对标题中的双引号进行转义，并用双引号包裹
            const escapedTitle = noteTitle.replace(/"/g, '\\"');
            // 构建正确的 AppleScript
            const script = `
                tell application "Reminders"
                    activate
                    if (exists reminder "${escapedTitle}") then
                        show reminder "${escapedTitle}"
                    else
                        make new reminder with properties {name:"${escapedTitle}"}
                    end if
                end tell
            `;
            // 将脚本转为 Base64，避免 shell 引号问题
            const scriptBase64 = Buffer.from(script).toString('base64');
            return new Promise((resolve, reject) => {
                exec(`osascript -e "$(echo ${scriptBase64} | base64 --decode)"`, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(stdout.trim());
                    }
                });
            });
        },
        description: "提醒事项，参数：行程标题",
        params: ["title"]
    },
    viewReminders: {
        fun: async() => {
            const { exec } = require('child_process');
            return new Promise((resolve, reject) => {
                exec("osascript -e 'tell application \"Reminders\" to get name of every reminder'", (error, stdout, stderr) => {
                    if (error) reject(error);
                    else resolve(stdout.trim());
                });
            });
        },
        description: "获取提醒事项中所有任务的名称",
        params: []
    },
    deleteReminder: {
        fun: async({ title }) => {
            const { exec } = require('child_process');
            // 对标题中的双引号进行转义（AppleScript 字符串内需要转义双引号）
            const escapedTitle = title.replace(/"/g, '\\"');
            // 构建 AppleScript：查找并删除第一个匹配标题的提醒
            const script = `
                tell application "Reminders"
                    try
                        set targetReminder to first reminder whose name is "${escapedTitle}"
                        delete targetReminder
                        return "已删除提醒事项: \\"${escapedTitle}\\""
                    on error errMsg
                        return "删除失败: " & errMsg
                    end try
                end tell
            `;
            // 将脚本转为 Base64，避免 shell 转义问题
            const scriptBase64 = Buffer.from(script).toString('base64');
            return new Promise((resolve, reject) => {
                exec(`osascript -e "$(echo ${scriptBase64} | base64 --decode)"`, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`删除提醒失败: ${stderr || error.message}`));
                    } else {
                        const output = stdout.trim();
                        if (output.startsWith('已删除')) {
                            resolve(output);
                        } else {
                            reject(new Error(output));
                        }
                    }
                });
            });
        },
        description: "删除指定标题的提醒事项，参数：提醒事项标题",
        params: ["title"]
    }
};