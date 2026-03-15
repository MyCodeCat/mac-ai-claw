module.exports = {
    openNotes: {
        fun: async(noteTitle) => {
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
    }
};